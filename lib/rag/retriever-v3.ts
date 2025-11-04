/**
 * Enhanced RAG Retriever V3 with VideoProductPool
 *
 * Uses precomputed product pools for ultra-fast retrieval.
 * Falls back to two-stage retrieval if pool doesn't exist.
 */

import { PrismaClient } from "@prisma/client";
import { createEmbedding } from "./openai";
import { SearchResult } from "./schema";
import { hybridSearch } from "./retriever";
import { twoStageHybridSearch } from "./retriever-v2";
import { getVideoProductPool } from "./video-product-pool";

const prisma = new PrismaClient();

/**
 * Vector search on precomputed pool (ultra-fast)
 */
async function vectorSearchOnPool(
  queryEmbedding: number[],
  poolProductIds: string[],
  options: {
    topK?: number;
    minScore?: number;
  } = {}
): Promise<SearchResult[]> {
  const { topK = 50, minScore = 0.3 } = options;

  if (poolProductIds.length === 0) {
    return [];
  }

  console.log(`[Pool-V3] Vector search on pool (${poolProductIds.length} products)...`);

  const query = `
    SELECT
      c.id,
      c."docId",
      c."chunkIndex",
      c.text,
      c.meta,
      d."sourceType",
      d."sourceId",
      1 - (c.embedding <=> $1::vector) as score
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'product'
      AND d."sourceId" = ANY($2::text[])
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> $1::vector
    LIMIT $3
  `;

  const results = await prisma.$queryRawUnsafe<any[]>(
    query,
    JSON.stringify(queryEmbedding),
    poolProductIds,
    topK
  );

  const filtered = results
    .filter(r => r.score >= minScore)
    .map(r => ({
      id: r.id,
      docId: r.docId,
      chunkIndex: r.chunkIndex,
      text: r.text,
      meta: r.meta,
      score: Math.max(0, Math.min(1, r.score)),
      sourceType: r.sourceType as "product",
      sourceId: r.sourceId,
    }));

  console.log(`[Pool-V3] Found ${filtered.length} results (score >= ${minScore})`);

  return filtered;
}

/**
 * Hybrid Search V3: Uses precomputed pool if available
 */
export async function poolBasedHybridSearch(
  query: string,
  videoId: string,
  options: {
    topK?: number;
    includeTranscripts?: boolean;
    includeProducts?: boolean;
    minScore?: number;
    maxPoolProducts?: number;
  } = {}
): Promise<SearchResult[]> {
  const {
    topK = 6,
    includeTranscripts = true,
    includeProducts = true,
    minScore = 0.3,
    maxPoolProducts = 100
  } = options;

  const results: SearchResult[] = [];

  // 1. Transcripts (no pool needed - direct search)
  if (includeTranscripts) {
    console.log(`[Pool-V3] Searching transcripts...`);
    const transcriptResults = await hybridSearch(query, {
      topK: Math.ceil(topK / 2),
      sourceType: "transcript",
      videoId,
      minScore
    });
    results.push(...transcriptResults);
    console.log(`[Pool-V3] Found ${transcriptResults.length} transcript results`);
  }

  // 2. Products (use pool if available)
  if (includeProducts) {
    // Check if pool exists
    const poolCount = await prisma.videoProductPool.count({
      where: { videoId }
    });

    if (poolCount > 0) {
      console.log(`[Pool-V3] Using precomputed pool (${poolCount} products)...`);

      // Get pool product IDs
      const poolProductIds = await getVideoProductPool(videoId, {
        topK: maxPoolProducts,
        minScore: 0.1 // Lower threshold for pool selection
      });

      console.log(`[Pool-V3] Retrieved ${poolProductIds.length} products from pool`);

      if (poolProductIds.length > 0) {
        // Vector search on pool
        const embedding = await createEmbedding(query);
        const productResults = await vectorSearchOnPool(
          embedding,
          poolProductIds,
          {
            topK: Math.ceil(topK / 2),
            minScore: 0.3
          }
        );

        results.push(...productResults);
        console.log(`[Pool-V3] Found ${productResults.length} product results from pool`);
      }
    } else {
      // Fallback to two-stage retrieval
      console.log(`[Pool-V3] No pool found, falling back to two-stage retrieval...`);
      const twoStageResults = await twoStageHybridSearch(query, videoId, {
        topK,
        includeTranscripts: false, // Already searched
        includeProducts: true,
        minScore
      });

      results.push(...twoStageResults);
    }
  }

  // Sort by score and return top K
  const sorted = results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  console.log(`[Pool-V3] Final results: ${sorted.length} total`);

  return sorted;
}

/**
 * Smart search with automatic pool/two-stage/regular fallback
 */
export async function smartSearchV3(
  query: string,
  videoId: string,
  options: {
    topK?: number;
    includeTranscripts?: boolean;
    includeProducts?: boolean;
  } = {}
): Promise<SearchResult[]> {
  // Try pool-based search first
  try {
    return await poolBasedHybridSearch(query, videoId, options);
  } catch (error) {
    console.error(`[Pool-V3] Pool-based search failed, falling back:`, error);

    // Fallback to two-stage
    try {
      return await twoStageHybridSearch(query, videoId, options);
    } catch (error2) {
      console.error(`[Pool-V3] Two-stage search failed, using regular hybrid:`, error2);

      // Final fallback to regular hybrid search
      const { topK = 6, includeTranscripts = true, includeProducts = true } = options;
      const sourceTypes: ("transcript" | "product")[] = [];

      if (includeTranscripts) sourceTypes.push("transcript");
      if (includeProducts) sourceTypes.push("product");

      const results: SearchResult[] = [];

      for (const sourceType of sourceTypes) {
        const typeResults = await hybridSearch(query, {
          topK: Math.ceil(topK / sourceTypes.length),
          sourceType,
          videoId: sourceType === "transcript" ? videoId : undefined,
          minScore: 0.3
        });
        results.push(...typeResults);
      }

      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }
  }
}
