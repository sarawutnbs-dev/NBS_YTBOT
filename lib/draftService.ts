import { prisma } from "@/lib/db";
import { generateDraftsBatch } from "@/lib/ai";
import { getPreview } from "@/lib/videoIndexService";
import { IndexStatus } from "@prisma/client";

export async function generateDraftsForComments() {
  // 1. ดึง comments ที่ยังไม่มี draft
  const comments = await prisma.comment.findMany({
    where: {
      draft: null
    },
    orderBy: { publishedAt: "desc" }
  });

  if (comments.length === 0) {
    return { success: true, message: "No comments to process", processedVideos: 0, generatedDrafts: 0 };
  }

  // 2. Group comments by videoId
  const commentsByVideo = new Map<string, typeof comments>();
  for (const comment of comments) {
    const existing = commentsByVideo.get(comment.videoId) || [];
    existing.push(comment);
    commentsByVideo.set(comment.videoId, existing);
  }

  let processedVideos = 0;
  let generatedDrafts = 0;

  // 3. Process each video group
  for (const [videoId, videoComments] of commentsByVideo.entries()) {
    try {
      // 4. เช็คว่า video มี transcript แล้วหรือไม่ และดึง tags
      const videoIndex = await prisma.videoIndex.findUnique({
        where: { videoId },
        select: {
          status: true,
          tags: true
        }
      });

      // ถ้าไม่มี transcript หรือยังไม่ READY ก็ข้าม
      if (!videoIndex || videoIndex.status !== IndexStatus.READY) {
        console.log(`[draftService] Skipping video ${videoId} - transcript not ready (status: ${videoIndex?.status || 'NOT_FOUND'})`);
        continue;
      }

      // 5. ดึง transcript
      const preview = await getPreview(videoId);
      if (!preview || !preview.chunks || preview.chunks.length === 0) {
        console.log(`[draftService] Skipping video ${videoId} - no transcript chunks`);
        continue;
      }

      // 6. ดึงรายการสินค้าที่มี Tag ตรงกับ Video
      const videoTags = videoIndex.tags || [];
      console.log(`[draftService] Video ${videoId} tags:`, videoTags);

      const products = await prisma.product.findMany({
        where: {
          tags: {
            hasSome: videoTags // ดึงสินค้าที่มี tag ตรงกับ video อย่างน้อย 1 tag
          }
        },
        select: {
          name: true,
          affiliateUrl: true,
          price: true,
          tags: true
        }
      });

      console.log(`[draftService] Found ${products.length} products matching video tags`);

      // ถ้าไม่มีสินค้าที่ตรงกับ tag ให้ข้าม
      if (products.length === 0) {
        console.log(`[draftService] Skipping video ${videoId} - no products with matching tags`);
        continue;
      }

      // 7. ส่งให้ AI ทำงาน
      console.log(`[draftService] Processing ${videoComments.length} comments for video ${videoId}`);

      const aiResponse = await generateDraftsBatch({
        videoId,
        comments: videoComments.map(c => ({
          commentId: c.id,
          text: c.textOriginal
        })),
        products: products.map(p => ({
          name: p.name,
          affiliateUrl: p.affiliateUrl,
          price: p.price
        })),
        transcript: {
          chunks: preview.chunks
        }
      });

      // 8. บันทึก drafts ลงฐานข้อมูล
      for (const draft of aiResponse.drafts) {
        await prisma.draft.upsert({
          where: { commentId: draft.commentId },
          update: {
            reply: draft.reply,
            status: "PENDING",
            suggestedProducts: JSON.stringify(draft.suggestedProducts),
            engagementScore: draft.scores.engagement,
            relevanceScore: draft.scores.relevance
          },
          create: {
            commentId: draft.commentId,
            reply: draft.reply,
            status: "PENDING",
            suggestedProducts: JSON.stringify(draft.suggestedProducts),
            engagementScore: draft.scores.engagement,
            relevanceScore: draft.scores.relevance
          }
        });

        generatedDrafts++;
      }

      processedVideos++;
      console.log(`[draftService] ✅ Generated ${aiResponse.drafts.length} drafts for video ${videoId}`);

    } catch (error) {
      console.error(`[draftService] ❌ Error processing video ${videoId}:`, error);
      // Continue with next video even if this one fails
    }
  }

  return {
    success: true,
    message: `Processed ${processedVideos} video(s), generated ${generatedDrafts} draft(s)`,
    processedVideos,
    generatedDrafts
  };
}

export async function generateDraftsForVideo(videoId: string) {
  // 1. ดึง comments สำหรับ video นี้ที่ยังไม่มี draft
  const comments = await prisma.comment.findMany({
    where: {
      videoId,
      draft: null
    },
    orderBy: { publishedAt: "desc" }
  });

  if (comments.length === 0) {
    return { success: true, message: "No comments to process for this video", generatedDrafts: 0 };
  }

  // 2. เช็คว่า video มี transcript แล้วหรือไม่ และดึง tags
  const videoIndex = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      status: true,
      tags: true
    }
  });

  if (!videoIndex || videoIndex.status !== IndexStatus.READY) {
    throw new Error(`Video ${videoId} does not have a ready transcript (status: ${videoIndex?.status || 'NOT_FOUND'})`);
  }

  // 3. ดึง transcript
  const preview = await getPreview(videoId);
  if (!preview || !preview.chunks || preview.chunks.length === 0) {
    throw new Error(`Video ${videoId} does not have transcript chunks`);
  }

  // 4. ดึงรายการสินค้าที่มี Tag ตรงกับ Video
  const videoTags = videoIndex.tags || [];
  console.log(`[draftService] Video ${videoId} tags:`, videoTags);

  const products = await prisma.product.findMany({
    where: {
      tags: {
        hasSome: videoTags // ดึงสินค้าที่มี tag ตรงกับ video อย่างน้อย 1 tag
      }
    },
    select: {
      name: true,
      affiliateUrl: true,
      price: true,
      tags: true
    }
  });

  console.log(`[draftService] Found ${products.length} products matching video tags`);

  // ถ้าไม่มีสินค้าที่ตรงกับ tag ให้แจ้ง error
  if (products.length === 0) {
    throw new Error(`No products found with tags matching video tags: ${videoTags.join(', ')}`);
  }

  // 5. ส่งให้ AI ทำงาน
  console.log(`[draftService] Processing ${comments.length} comments for video ${videoId}`);

  const aiResponse = await generateDraftsBatch({
    videoId,
    comments: comments.map(c => ({
      commentId: c.id,
      text: c.textOriginal
    })),
    products: products.map(p => ({
      name: p.name,
      affiliateUrl: p.affiliateUrl,
      price: p.price
    })),
    transcript: {
      chunks: preview.chunks
    }
  });

  // 6. บันทึก drafts ลงฐานข้อมูล
  for (const draft of aiResponse.drafts) {
    await prisma.draft.upsert({
      where: { commentId: draft.commentId },
      update: {
        reply: draft.reply,
        status: "PENDING",
        suggestedProducts: JSON.stringify(draft.suggestedProducts),
        engagementScore: draft.scores.engagement,
        relevanceScore: draft.scores.relevance
      },
      create: {
        commentId: draft.commentId,
        reply: draft.reply,
        status: "PENDING",
        suggestedProducts: JSON.stringify(draft.suggestedProducts),
        engagementScore: draft.scores.engagement,
        relevanceScore: draft.scores.relevance
      }
    });
  }

  console.log(`[draftService] ✅ Generated ${aiResponse.drafts.length} drafts for video ${videoId}`);

  return {
    success: true,
    message: `Generated ${aiResponse.drafts.length} draft(s) for video ${videoId}`,
    generatedDrafts: aiResponse.drafts.length
  };
}
