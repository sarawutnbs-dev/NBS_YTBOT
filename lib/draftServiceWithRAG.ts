/**
 * Draft Service with RAG Integration
 *
 * Enhanced version that uses RAG system for better context retrieval
 */

import { prisma } from "@/lib/db";
import { IndexStatus } from "@prisma/client";
import { ingestComment, ingestTranscript, ingestProduct } from "@/lib/rag/ingest";
import { getIndexStats } from "@/lib/rag/retriever";
import { generateCommentReply } from "@/lib/rag/comment-reply";

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
          title: true,
          chunksJSON: true,
        }
      });

      if (!videoIndex || videoIndex.status !== IndexStatus.READY) {
        console.log(`[draftService:RAG] ⏭️  Skipping video ${videoId} - transcript not ready (status: ${videoIndex?.status || 'NOT_FOUND'})`);
        continue;
      }

      // Check if transcript has actual content (stored in chunksJSON)
      if (!videoIndex.chunksJSON || videoIndex.chunksJSON.trim().length === 0) {
        console.log(`[draftService:RAG] ⏭️  Skipping video ${videoId} - transcript is empty`);
        continue;
      }

      // 8. Use comment-reply system (with shortURL) instead of generateBatchAnswers
      console.log(`[draftService:RAG] 🤖 Generating ${videoComments.length} replies with shortURLs...`);

      let videoTokens = 0;

      for (const comment of videoComments) {
        try {
          const result = await generateCommentReply({
            commentText: comment.textOriginal,
            videoId: videoId,
            includeProducts: true,
            includeTranscripts: true,
          });

          // Get full product details from database
          const productDetails = await Promise.all(
            result.products.map(async (p) => {
              const product = await prisma.product.findUnique({
                where: { id: p.id },
                select: {
                  id: true,
                  name: true,
                  price: true,
                  affiliateUrl: true,
                  shortURL: true,
                }
              });
              return product;
            })
          );

          const validProducts = productDetails.filter((p): p is NonNullable<typeof p> => p !== null);

          // Save draft with shortURLs already inserted in replyText
          await prisma.draft.upsert({
            where: { commentId: comment.id },
            update: {
              reply: result.replyText, // Already has shortURLs inserted
              status: "PENDING",
              suggestedProducts: JSON.stringify(validProducts.map(p => ({
                id: p.id,
                name: p.name,
                price: p.price,
                url: p.affiliateUrl,
                shortURL: p.shortURL,
              }))),
              engagementScore: 0.8,
              relevanceScore: result.contexts[0]?.score || 0.7,
            },
            create: {
              commentId: comment.id,
              reply: result.replyText, // Already has shortURLs inserted
              status: "PENDING",
              suggestedProducts: JSON.stringify(validProducts.map(p => ({
                id: p.id,
                name: p.name,
                price: p.price,
                url: p.affiliateUrl,
                shortURL: p.shortURL,
              }))),
              engagementScore: 0.8,
              relevanceScore: result.contexts[0]?.score || 0.7,
            }
          });

          generatedDrafts++;
          videoTokens += result.tokenUsage.totalTokens;

          console.log(`[draftService:RAG] ✅ Comment ${comment.id}: ${result.products.length} products, ${result.tokenUsage.totalTokens} tokens`);

        } catch (error) {
          console.error(`[draftService:RAG] ❌ Error generating reply for comment ${comment.id}:`, error);
          // Continue with next comment
        }
      }

      processedVideos++;
      console.log(`[draftService:RAG] ✅ Saved ${generatedDrafts} drafts for video ${videoId} (${videoTokens} tokens)`);

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
 * Generate drafts for a specific video using RAG with comment-reply system
 * This version uses generateCommentReply which includes automatic shortURL insertion
 */
export async function generateDraftsForVideoWithRAG(videoId: string) {
  console.log(`[draftService:RAG] 🚀 Starting draft generation for video ${videoId}...`);

  // 1. Get video info
  const videoIndex = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      id: true,
      videoId: true,
      status: true,
      title: true,
      tags: true,
    }
  });

  if (!videoIndex) {
    throw new Error(`Video ${videoId} not found in index`);
  }

  if (videoIndex.status !== IndexStatus.READY) {
    throw new Error(`Video ${videoId} is not ready (status: ${videoIndex.status})`);
  }

  // 2. Get comments without drafts for this video
  const comments = await prisma.comment.findMany({
    where: {
      videoId,
      draft: null
    },
    orderBy: { publishedAt: "desc" }
  });

  if (comments.length === 0) {
    return { 
      success: true, 
      message: "No comments to process", 
      generatedDrafts: 0 
    };
  }

  console.log(`[draftService:RAG] 📝 Found ${comments.length} comments without drafts`);

  // 3. Generate drafts using comment-reply system (with shortURL)
  let generatedDrafts = 0;
  let totalTokens = 0;

  for (const comment of comments) {
    try {
      console.log(`[draftService:RAG] 🤖 Generating reply for comment ${comment.id}...`);

      const result = await generateCommentReply({
        commentText: comment.textOriginal,
        videoId: videoIndex.videoId,
        includeProducts: true,
        includeTranscripts: true,
      });

      // Get full product details from database
      const productDetails = await Promise.all(
        result.products.map(async (p) => {
          const product = await prisma.product.findUnique({
            where: { id: p.id },
            select: {
              id: true,
              name: true,
              price: true,
              affiliateUrl: true,
              shortURL: true,
            }
          });
          return product;
        })
      );

      const validProducts = productDetails.filter((p): p is NonNullable<typeof p> => p !== null);

      // Save draft with shortURLs already inserted in replyText
      await prisma.draft.upsert({
        where: { commentId: comment.id },
        update: {
          reply: result.replyText, // Already has shortURLs inserted
          status: "PENDING",
          suggestedProducts: JSON.stringify(validProducts.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            url: p.affiliateUrl,
            shortURL: p.shortURL,
          }))),
          engagementScore: 0.8,
          relevanceScore: result.contexts[0]?.score || 0.7,
        },
        create: {
          commentId: comment.id,
          reply: result.replyText, // Already has shortURLs inserted
          status: "PENDING",
          suggestedProducts: JSON.stringify(validProducts.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            url: p.affiliateUrl,
            shortURL: p.shortURL,
          }))),
          engagementScore: 0.8,
          relevanceScore: result.contexts[0]?.score || 0.7,
        }
      });

      generatedDrafts++;
      totalTokens += result.tokenUsage.totalTokens;

      console.log(`[draftService:RAG] ✅ Saved draft for comment ${comment.id} (${result.products.length} products, ${result.tokenUsage.totalTokens} tokens)`);

    } catch (error) {
      console.error(`[draftService:RAG] ❌ Error generating draft for comment ${comment.id}:`, error);
      // Continue with next comment
    }
  }

  const message = `Generated ${generatedDrafts} draft(s) for video ${videoId} with shortURLs (${totalTokens} tokens)`;
  console.log(`[draftService:RAG] ✅ ${message}`);

  return {
    success: true,
    message,
    generatedDrafts,
    tokensUsed: totalTokens,
  };
}
