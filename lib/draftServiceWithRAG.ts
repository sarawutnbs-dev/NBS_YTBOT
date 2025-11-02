/**
 * Draft Service with RAG Integration
 *
 * Enhanced version that uses RAG system for better context retrieval
 */

import { prisma } from "@/lib/db";
import { generateDraftsBatch } from "@/lib/ai";
import { IndexStatus } from "@prisma/client";
import { generateBatchAnswers } from "@/lib/rag/answer";
import { ingestComment, ingestTranscript, ingestProduct } from "@/lib/rag/ingest";
import { getIndexStats } from "@/lib/rag/retriever";

/**
 * Generate drafts for comments using RAG
 */
export async function generateDraftsForCommentsWithRAG() {
  console.log("[draftService:RAG] 🚀 Starting batch draft generation with RAG...");

  // 1. Get comments without drafts
  const comments = await prisma.comment.findMany({
    where: {
      draft: null
    },
    orderBy: { publishedAt: "desc" }
  });

  if (comments.length === 0) {
    return { success: true, message: "No comments to process", processedVideos: 0, generatedDrafts: 0 };
  }

  console.log(`[draftService:RAG] 📝 Found ${comments.length} comments without drafts`);

  // 2. Check RAG system status
  const ragStats = await getIndexStats();
  console.log(`[draftService:RAG] 📊 RAG Stats:`, {
    documents: ragStats.totalDocuments,
    chunks: ragStats.totalChunks,
    transcripts: ragStats.bySourceType.transcripts.documents,
    products: ragStats.bySourceType.products.documents,
  });

  // 3. Group comments by videoId
  const commentsByVideo = new Map<string, typeof comments>();
  for (const comment of comments) {
    const existing = commentsByVideo.get(comment.videoId) || [];
    existing.push(comment);
    commentsByVideo.set(comment.videoId, existing);
  }

  let processedVideos = 0;
  let generatedDrafts = 0;

  // 4. Process each video group
  for (const [videoId, videoComments] of commentsByVideo.entries()) {
    try {
      console.log(`[draftService:RAG] 🎥 Processing video ${videoId} with ${videoComments.length} comments`);

      // 5. Check if video has transcript
      const videoIndex = await prisma.videoIndex.findUnique({
        where: { videoId },
        select: {
          status: true,
          tags: true,
          transcript: true,
          title: true,
          channelName: true,
          publishedAt: true,
          duration: true,
          viewCount: true,
        }
      });

      if (!videoIndex || videoIndex.status !== IndexStatus.READY) {
        console.log(`[draftService:RAG] ⏭️  Skipping video ${videoId} - transcript not ready (status: ${videoIndex?.status || 'NOT_FOUND'})`);
        continue;
      }

      // Check if transcript has actual content
      if (!videoIndex.transcript || videoIndex.transcript.trim().length === 0) {
        console.log(`[draftService:RAG] ⏭️  Skipping video ${videoId} - transcript is empty`);
        continue;
      }

      // 6. Auto-ingest transcript if not already in RAG
      await ensureTranscriptIndexed(videoId, videoIndex);

      // 7. Auto-ingest products with matching tags if needed
      const videoTags = videoIndex.tags || [];
      await ensureProductsIndexed(videoTags);

      // 8. Use RAG to generate answers
      console.log(`[draftService:RAG] 🤖 Using RAG to generate ${videoComments.length} answers...`);

      const ragResponses = await generateBatchAnswers(
        videoId,
        videoComments.map(c => ({
          commentId: c.id,
          text: c.textOriginal
        })),
        {
          includeProducts: true,
          includeTranscripts: true,
          temperature: 0.7,
        }
      );

      console.log(`[draftService:RAG] ✅ RAG generated ${ragResponses.results.length} answers (${ragResponses.totalTokensUsed} tokens)`);

      // 9. Save drafts to database
      for (const result of ragResponses.results) {
        const comment = videoComments.find(c => c.id === result.commentId);
        if (!comment) continue;

        // Extract product suggestions from contexts
        const productContexts = result.contexts.filter(ctx => ctx.sourceType === "product");
        const suggestedProducts = productContexts.map(ctx => ({
          name: (ctx.meta as any).name,
          url: (ctx.meta as any).url,
          price: (ctx.meta as any).price,
        }));

        await prisma.draft.upsert({
          where: { commentId: result.commentId },
          update: {
            reply: result.answer,
            status: "PENDING",
            suggestedProducts: JSON.stringify(suggestedProducts),
            engagementScore: 0.8, // Default score - can be enhanced later
            relevanceScore: result.contexts[0]?.score || 0.7,
          },
          create: {
            commentId: result.commentId,
            reply: result.answer,
            status: "PENDING",
            suggestedProducts: JSON.stringify(suggestedProducts),
            engagementScore: 0.8,
            relevanceScore: result.contexts[0]?.score || 0.7,
          }
        });

        generatedDrafts++;
      }

      processedVideos++;
      console.log(`[draftService:RAG] ✅ Saved ${ragResponses.results.length} drafts for video ${videoId}`);

    } catch (error) {
      console.error(`[draftService:RAG] ❌ Error processing video ${videoId}:`, error);
      // Continue with next video
    }
  }

  const message = `Processed ${processedVideos} video(s), generated ${generatedDrafts} draft(s) using RAG`;
  console.log(`[draftService:RAG] 🎉 ${message}`);

  return {
    success: true,
    message,
    processedVideos,
    generatedDrafts
  };
}

/**
 * Ensure transcript is indexed in RAG
 */
async function ensureTranscriptIndexed(videoId: string, videoIndex: any) {
  if (!videoIndex.transcript) {
    console.log(`[draftService:RAG] ⚠️  Video ${videoId} has no transcript`);
    return;
  }

  try {
    // Check if already indexed
    const { getChunksBySource } = await import("@/lib/rag/retriever");
    const existing = await getChunksBySource("transcript", videoId);

    if (existing.length > 0) {
      console.log(`[draftService:RAG] ✓ Transcript ${videoId} already indexed (${existing.length} chunks)`);
      return;
    }

    // Index transcript
    console.log(`[draftService:RAG] 📥 Indexing transcript for ${videoId}...`);

    await ingestTranscript({
      videoId,
      title: videoIndex.title || "Untitled",
      channelName: videoIndex.channelName || "Unknown",
      transcript: videoIndex.transcript,
      publishedAt: videoIndex.publishedAt?.toISOString(),
      duration: videoIndex.duration || undefined,
      viewCount: videoIndex.viewCount || undefined,
    }, false);

    console.log(`[draftService:RAG] ✅ Transcript ${videoId} indexed successfully`);
  } catch (error) {
    console.error(`[draftService:RAG] ❌ Failed to index transcript ${videoId}:`, error);
  }
}

/**
 * Ensure products with matching tags are indexed in RAG
 */
async function ensureProductsIndexed(videoTags: string[]) {
  if (videoTags.length === 0) {
    console.log(`[draftService:RAG] ⚠️  No video tags to match products`);
    return;
  }

  try {
    // Get products with matching tags
    const products = await prisma.product.findMany({
      where: {
        tags: {
          hasSome: videoTags
        }
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        affiliateUrl: true,
        imageUrl: true,
        category: true,
        tags: true,
      }
    });

    if (products.length === 0) {
      console.log(`[draftService:RAG] ⚠️  No products match tags: ${videoTags.join(', ')}`);
      return;
    }

    console.log(`[draftService:RAG] 🛍️  Found ${products.length} products with matching tags`);

    // Check which products need indexing
    const { getChunksBySource } = await import("@/lib/rag/retriever");

    for (const product of products) {
      const existing = await getChunksBySource("product", product.id);

      if (existing.length > 0) {
        continue; // Already indexed
      }

      // Index product
      console.log(`[draftService:RAG] 📥 Indexing product ${product.id} (${product.name})...`);

      await ingestProduct({
        productId: product.id,
        name: product.name,
        description: product.description || undefined,
        price: product.price ? parseFloat(product.price.toString()) : undefined,
        url: product.affiliateUrl || undefined,
        imageUrl: product.imageUrl || undefined,
        category: product.category || undefined,
        tags: product.tags || undefined,
      }, false);

      console.log(`[draftService:RAG] ✅ Product ${product.id} indexed`);
    }
  } catch (error) {
    console.error(`[draftService:RAG] ❌ Failed to index products:`, error);
  }
}

/**
 * Generate drafts for a specific video using RAG
 */
export async function generateDraftsForVideoWithRAG(videoId: string) {
  console.log(`[draftService:RAG] 🚀 Starting draft generation for video ${videoId} with RAG...`);

  // 1. Get comments for this video without drafts
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

  // 2. Check video transcript
  const videoIndex = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      status: true,
      tags: true,
      transcript: true,
      title: true,
      channelName: true,
      publishedAt: true,
      duration: true,
      viewCount: true,
    }
  });

  if (!videoIndex || videoIndex.status !== IndexStatus.READY) {
    throw new Error(`Video ${videoId} does not have a ready transcript (status: ${videoIndex?.status || 'NOT_FOUND'})`);
  }

  // Check if transcript has actual content
  if (!videoIndex.transcript || videoIndex.transcript.trim().length === 0) {
    throw new Error(`Video ${videoId} has no transcript content`);
  }

  // 3. Ensure data is indexed
  await ensureTranscriptIndexed(videoId, videoIndex);
  await ensureProductsIndexed(videoIndex.tags || []);

  // 4. Use RAG to generate answers
  const ragResponses = await generateBatchAnswers(
    videoId,
    comments.map(c => ({
      commentId: c.id,
      text: c.textOriginal
    })),
    {
      includeProducts: true,
      includeTranscripts: true,
      temperature: 0.7,
    }
  );

  // 5. Save drafts
  for (const result of ragResponses.results) {
    const productContexts = result.contexts.filter(ctx => ctx.sourceType === "product");
    const suggestedProducts = productContexts.map(ctx => ({
      name: (ctx.meta as any).name,
      url: (ctx.meta as any).url,
      price: (ctx.meta as any).price,
    }));

    await prisma.draft.upsert({
      where: { commentId: result.commentId },
      update: {
        reply: result.answer,
        status: "PENDING",
        suggestedProducts: JSON.stringify(suggestedProducts),
        engagementScore: 0.8,
        relevanceScore: result.contexts[0]?.score || 0.7,
      },
      create: {
        commentId: result.commentId,
        reply: result.answer,
        status: "PENDING",
        suggestedProducts: JSON.stringify(suggestedProducts),
        engagementScore: 0.8,
        relevanceScore: result.contexts[0]?.score || 0.7,
      }
    });
  }

  const message = `Generated ${ragResponses.results.length} draft(s) for video ${videoId} using RAG (${ragResponses.totalTokensUsed} tokens)`;
  console.log(`[draftService:RAG] ✅ ${message}`);

  return {
    success: true,
    message,
    generatedDrafts: ragResponses.results.length,
    tokensUsed: ragResponses.totalTokensUsed,
  };
}
