import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getPreview } from "@/lib/videoIndexService";
import { IndexStatus } from "@prisma/client";
import { COMMENT_REPLY_SYSTEM_PROMPT, FEW_SHOT_EXAMPLES } from "@/lib/rag/prompts";

const requestSchema = z.object({
  videoId: z.string()
});

const MAX_PRODUCTS = Number(process.env.AI_MAX_PRODUCTS || 20);
const MAX_TRANSCRIPT_CHUNKS = Number(process.env.AI_MAX_TRANSCRIPT_CHUNKS || 200);

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession() as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const input = requestSchema.parse(body);

    console.log(`[API] Previewing context for video ${input.videoId}...`);

    // 1. ดึง comments สำหรับ video นี้ที่ยังไม่มี draft
    const comments = await prisma.comment.findMany({
      where: {
        videoId: input.videoId,
        draft: null
      },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        textOriginal: true,
        authorDisplayName: true,
        publishedAt: true
      }
    });

    if (comments.length === 0) {
      return NextResponse.json({
        error: "No comments to process for this video"
      }, { status: 400 });
    }

    // 2. เช็คว่า video มี transcript แล้วหรือไม่ และดึง tags
    const videoIndex = await prisma.videoIndex.findUnique({
      where: { videoId: input.videoId },
      select: {
        status: true,
        tags: true,
        title: true
      }
    });

    if (!videoIndex || videoIndex.status !== IndexStatus.READY) {
      return NextResponse.json({
        error: `Video does not have a ready transcript (status: ${videoIndex?.status || 'NOT_FOUND'})`
      }, { status: 400 });
    }

    // 3. ดึง transcript
    const preview = await getPreview(input.videoId);
    if (!preview || !preview.chunks || preview.chunks.length === 0) {
      return NextResponse.json({
        error: "Video does not have transcript chunks"
      }, { status: 400 });
    }

    // 4. ดึงรายการสินค้าที่มี Tag ตรงกับ Video
    const videoTags = videoIndex.tags || [];

    const products = await prisma.product.findMany({
      where: {
        tags: {
          hasSome: videoTags
        }
      },
      select: {
        name: true,
        affiliateUrl: true,
        price: true,
        tags: true
      }
    });

    // ถ้าไม่มีสินค้าที่ตรงกับ tag ก็ไม่เป็นไร จะส่ง empty array ไปให้ AI
    if (products.length === 0) {
      console.log(`[API] No products found with tags matching video tags: ${videoTags.join(', ')} - will proceed without product suggestions`);
    }

    // 5. ตัดข้อมูลให้พอดี token
    const trimmedProducts = products.slice(0, MAX_PRODUCTS).map(p => ({
      name: p.name,
      affiliateUrl: p.affiliateUrl,
      price: p.price,
      tags: p.tags
    }));
    const trimmedChunks = preview.chunks.slice(0, MAX_TRANSCRIPT_CHUNKS);

    // 6. สร้าง prompt ที่จะใช้จริง
    const fullPrompt = `${COMMENT_REPLY_SYSTEM_PROMPT}

${FEW_SHOT_EXAMPLES}

=== Context ที่จะส่งไปให้ AI ===
Video: ${videoIndex.title}
Transcript chunks: ${trimmedChunks.length} chunks
Products: ${trimmedProducts.length} รายการ
Comments: ${comments.length} รายการ
`;

    return NextResponse.json({
      success: true,
      data: {
        videoTitle: videoIndex.title,
        videoTags: videoTags,
        commentsCount: comments.length,
        comments: comments,
        productsCount: trimmedProducts.length,
        products: trimmedProducts,
        transcriptChunksCount: trimmedChunks.length,
        transcript: trimmedChunks,
        promptPreview: fullPrompt
      }
    });
  } catch (error) {
    console.error("[API] ❌ Error previewing context:", error);
    const message = error instanceof Error ? error.message : "Failed to preview context";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
