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
import { detectQueryIntent } from "./query-intent";
// Pool-based functions are disabled for current schema (no VideoProductPool table)

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

  // Convert internal Product IDs to shopeeProductIds for RAG lookup
  const products = await prisma.product.findMany({
    where: {
      id: { in: poolProductIds }
    },
    select: {
      shopeeProductId: true
    }
  });

  const shopeeProductIds = products
    .map(p => p.shopeeProductId)
    .filter((id): id is string => id !== null);

  if (shopeeProductIds.length === 0) {
    console.log(`[Pool-V3] No shopeeProductIds found for pool products`);
    return [];
  }

  console.log(`[Pool-V3] Mapped ${poolProductIds.length} internal IDs → ${shopeeProductIds.length} Shopee IDs`);

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
    shopeeProductIds,
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
    maxPoolProducts = 100,
  } = options;

  const results: SearchResult[] = [];

  // 1. Search transcripts (direct hybrid search)
  if (includeTranscripts) {
    const transcriptResults = await hybridSearch(query, {
      topK: Math.ceil(topK / 2),
      sourceType: "transcript",
      videoId,
      minScore,
    });
    results.push(...transcriptResults);
    console.log(`[Pool-V3] Found ${transcriptResults.length} transcript results`);
  }

  // 2. Search products using precomputed pool
  if (includeProducts) {
    try {
      // Get pool product IDs
      const { getVideoProductPool } = await import('./video-product-pool');
      const poolProductIds = await getVideoProductPool(videoId, {
        topK: maxPoolProducts,
        minScore: 0.1, // Lower threshold for pool filtering
      });

      if (poolProductIds.length > 0) {
        console.log(`[Pool-V3] Using pool with ${poolProductIds.length} products`);

        // Vector search on pool
        const embedding = await createEmbedding(query);
        const productResults = await vectorSearchOnPool(embedding, poolProductIds, {
          topK: Math.ceil(topK / 2),
          minScore,
        });

        results.push(...productResults);
      } else {
        console.log(`[Pool-V3] No pool found, falling back to two-stage`);
        // Fallback to two-stage if no pool
        return twoStageHybridSearch(query, videoId, options);
      }
    } catch (error) {
      console.error(`[Pool-V3] Pool search failed, falling back to two-stage:`, error);
      return twoStageHybridSearch(query, videoId, options);
    }
  }

  // Sort by score and return top K
  const sorted = results.sort((a, b) => b.score - a.score).slice(0, topK);

  console.log(`[Pool-V3] Total results: ${sorted.length}`);

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
    minScore?: number;
  } = {}
): Promise<SearchResult[]> {
  // Try pool-based search first, falls back to two-stage automatically if pool doesn't exist
  return poolBasedHybridSearch(query, videoId, options);
}
