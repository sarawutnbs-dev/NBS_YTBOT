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
  // For current schema, directly use two-stage hybrid search with intent-aware filters (in retriever-v2)
  console.log(`[Pool-V3] Pool disabled; using two-stage retrieval`);
  return twoStageHybridSearch(query, videoId, options);
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
  // Use two-stage with intent-aware filtering
  return twoStageHybridSearch(query, videoId, options);
}
