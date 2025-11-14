import { prisma } from "@/lib/db";
import { generateDraftsBatch } from "@/lib/ai";
import { getPreview } from "@/lib/videoIndexService";
import { IndexStatus } from "@prisma/client";

// Batching and trimming to avoid token overflows
const MAX_COMMENTS_PER_CALL = Number(process.env.AI_MAX_COMMENTS_PER_CALL || 25);
const MAX_PRODUCTS = Number(process.env.AI_MAX_PRODUCTS || 20);
const MAX_TRANSCRIPT_CHUNKS = Number(process.env.AI_MAX_TRANSCRIPT_CHUNKS || 200);

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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
          shortURL: true,
          price: true,
          tags: true
        }
      });

      console.log(`[draftService] Found ${products.length} products matching video tags`);

      // ถ้าไม่มีสินค้าที่ตรงกับ tag ให้ส่ง empty array ไปให้ AI (AI จะตอบโดยไม่แนะนำสินค้า)
      if (products.length === 0) {
        console.log(`[draftService] No products with matching tags for video ${videoId} - will proceed without product suggestions`);
      }

      // 7. ตัดข้อมูลให้พอดี token และส่งให้ AI แบบแบ่ง batch
      const trimmedProducts = products
        .filter(p => p.shortURL !== null)
        .slice(0, MAX_PRODUCTS)
        .map(p => ({
          name: p.name,
          affiliateUrl: p.shortURL!,
          price: p.price
        }));
      const trimmedChunks = preview.chunks.slice(0, MAX_TRANSCRIPT_CHUNKS);

      console.log(`[draftService] Processing ${videoComments.length} comments for video ${videoId} in batches of ${MAX_COMMENTS_PER_CALL}`);
      const commentBatches = chunkArray(videoComments, MAX_COMMENTS_PER_CALL);

      for (let i = 0; i < commentBatches.length; i++) {
        const batch = commentBatches[i];
        console.log(`[draftService] \tBatch ${i + 1}/${commentBatches.length} with ${batch.length} comments`);

        const aiResponse = await generateDraftsBatch({
          videoId,
          comments: batch.map(c => ({ commentId: c.id, text: c.textOriginal })),
          products: trimmedProducts,
          transcript: { chunks: trimmedChunks }
        });

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
      }

  processedVideos++;
  console.log(`[draftService] ✅ Generated ${generatedDrafts} drafts so far for video ${videoId}`);

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
      shortURL: true,
      price: true,
      tags: true
    }
  });

  console.log(`[draftService] Found ${products.length} products matching video tags`);

  // ถ้าไม่มีสินค้าที่ตรงกับ tag ให้ส่ง empty array ไปให้ AI (AI จะตอบโดยไม่แนะนำสินค้า)
  if (products.length === 0) {
    console.log(`[draftService] No products with matching tags for video ${videoId} (tags: ${videoTags.join(', ')}) - will proceed without product suggestions`);
  }

  // 5. ตัดข้อมูลให้พอดี token
  const trimmedProducts = products
    .filter(p => p.shortURL !== null)
    .slice(0, MAX_PRODUCTS)
    .map(p => ({
      name: p.name,
      affiliateUrl: p.shortURL!,
      price: p.price
    }));
  const trimmedChunks = preview.chunks.slice(0, MAX_TRANSCRIPT_CHUNKS);

  // 6. ส่งให้ AI ทำงานแบบแบ่ง batch ตามจำนวนคอมเมนต์
  console.log(`[draftService] Processing ${comments.length} comments for video ${videoId} in batches of ${MAX_COMMENTS_PER_CALL}`);
  const commentBatches = chunkArray(comments, MAX_COMMENTS_PER_CALL);
  let totalDrafts = 0;

  for (let i = 0; i < commentBatches.length; i++) {
    const batch = commentBatches[i];
    console.log(`[draftService] \tBatch ${i + 1}/${commentBatches.length} with ${batch.length} comments`);

    const aiResponse = await generateDraftsBatch({
      videoId,
      comments: batch.map(c => ({ commentId: c.id, text: c.textOriginal })),
      products: trimmedProducts,
      transcript: { chunks: trimmedChunks }
    });

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
      totalDrafts++;
    }
  }

  console.log(`[draftService] ✅ Generated ${totalDrafts} drafts for video ${videoId}`);

  return {
    success: true,
    message: `Generated ${totalDrafts} draft(s) for video ${videoId}`,
    generatedDrafts: totalDrafts
  };
}
