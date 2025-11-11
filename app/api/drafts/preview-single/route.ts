import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { smartSearchV3 } from "@/lib/rag/retriever-v3";
import { COMMENT_REPLY_SYSTEM_PROMPT, FEW_SHOT_EXAMPLES } from "@/lib/rag/prompts";
import { getPreview } from "@/lib/videoIndexService";

/**
 * POST /api/drafts/preview-single
 * Preview context data for a single comment before regenerating draft
 */
export async function POST(request: NextRequest) {
  try {
    const session = (await getServerAuthSession()) as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    const { commentId } = await request.json();

    if (!commentId) {
      return NextResponse.json({ error: "Comment ID is required" }, { status: 400 });
    }

    // Get comment
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        textOriginal: true,
        videoId: true,
      },
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Get video info
    const videoIndex = await prisma.videoIndex.findUnique({
      where: { videoId: comment.videoId },
      select: {
        status: true,
        tags: true,
        title: true,
      },
    });

    if (!videoIndex || videoIndex.status !== "READY") {
      return NextResponse.json(
        { error: "Video does not have a transcript ready" },
        { status: 400 }
      );
    }

    // Get transcript chunks
    const preview = await getPreview(comment.videoId);
    const transcriptChunks = preview?.chunks || [];

    // Search for contexts using RAG
    console.log(`[preview-single] Searching contexts for comment: ${comment.textOriginal.substring(0, 50)}...`);

    const contexts = await smartSearchV3(comment.textOriginal, comment.videoId, {
      topK: 6,
      includeTranscripts: true,
      includeProducts: true,
      minScore: 0.2,
    });

    console.log(`[preview-single] Found ${contexts.length} contexts`);

    // Get suggested products from contexts
    const productContexts = contexts.filter((c) => c.sourceType === "product");
    const productIds = [...new Set(productContexts.map((c) => c.sourceId))];

    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
      select: {
        id: true,
        name: true,
        price: true,
        shortURL: true,
      },
    });

    console.log(`[preview-single] Found ${products.length} products`);

    // Build prompt preview
    const contextText = contexts.length > 0
      ? contexts.map((c, idx) => `[${idx + 1}] ${c.sourceType} (score: ${c.score.toFixed(2)}):\n${c.text}`).join("\n\n")
      : "(ไม่มีข้อมูลจากวิดีโอ - ใช้ความรู้ทั่วไปในการตอบ)";

    const productsText = products.length > 0
      ? `\n\n--- Suggested Products ---\n` +
        products.map((p, idx) => `${idx + 1}. ${p.name} - ${p.price} บาท\n   URL: ${p.shortURL}`).join("\n\n")
      : "";

    const promptPreview = `${COMMENT_REPLY_SYSTEM_PROMPT}

${FEW_SHOT_EXAMPLES}

--- Context Information ---

${contextText}${productsText}

--- คอมเมนต์ ---
"${comment.textOriginal}"`;

    // Build response
    return NextResponse.json({
      videoTitle: videoIndex.title,
      videoTags: videoIndex.tags || [],
      commentText: comment.textOriginal,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        url: p.shortURL || "",
        tags: [],
      })),
      contexts: contexts.map((c) => ({
        text: c.text,
        score: c.score,
        sourceType: c.sourceType,
      })),
      transcriptChunks: transcriptChunks.slice(0, 200),
      promptPreview,
    });
  } catch (error) {
    console.error("[POST /api/drafts/preview-single] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to preview context";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
