/**
 * Enhanced RAG Retriever with Two-Stage Filtering
 *
 * Stage 1: Metadata Filtering (Fast SQL) - reduces candidates from 10,000+ to ~100
 * Stage 2: ANN Vector Search (pgvector) - precise semantic matching on filtered set
 */

import { PrismaClient } from "@prisma/client";
import { createEmbedding } from "./openai";
import { SearchResult } from "./schema";
import { vectorSearch, keywordSearch, hybridSearch } from "./retriever";

const prisma = new PrismaClient();

export interface FilterOptions {
  categories?: string[];      // Category names to filter
  brands?: string[];          // Brand names to filter
  tags?: string[];            // Tags to match (any)
  priceRange?: [number, number]; // [min, max] price
  maxCandidates?: number;     // Max products after filtering (default: 100)
}

/**
 * Stage 1: Fast metadata filtering to reduce candidate pool
 * Returns internal product IDs (not shopeeProductId) for RAG lookup
 */
export async function filterProductCandidates(
  videoId: string,
  options: FilterOptions = {}
): Promise<string[]> {
  const { maxCandidates = 100 } = options;

  console.log(`[Two-Stage] Filtering products for video ${videoId}...`);
  console.log(`[Two-Stage] Filters:`, options);

  const filters: any = {
    // Business rules (MUST have)
    shopeeProductId: { not: null },
    inStock: true,
    hasAffiliate: true,

    // Metadata filters (SHOULD match)
    ...(options.categories?.length && {
      categoryName: { in: options.categories }
    }),
    ...(options.brands?.length && {
      brand: { in: options.brands }
    }),
    ...(options.tags?.length && {
      tags: { hasSome: options.tags }
    }),
    ...(options.priceRange && {
      OR: [
        {
          // Price within range
          price: {
            gte: options.priceRange[0],
            lte: options.priceRange[1]
          }
        },
        {
          // Price range overlaps with query range
          AND: [
            { priceMin: { lte: options.priceRange[1] } },
            { priceMax: { gte: options.priceRange[0] } }
          ]
        }
      ]
    }),
  };

  const products = await prisma.product.findMany({
    where: filters,
    select: { id: true }, // Use internal ID for RAG lookup
    take: maxCandidates,
    orderBy: [
      { updatedAt: 'desc' }, // Prioritize recent products
    ]
  });

  const candidateIds = products.map(p => p.id);

  console.log(`[Two-Stage] Filtered to ${candidateIds.length} candidates (from metadata)`);

  return candidateIds;
}

/**
 * Stage 2: Vector search on filtered candidates only
 */
export async function vectorSearchWithFilter(
  queryEmbedding: number[],
  candidateIds: string[],
  options: {
    topK?: number;
    minScore?: number;
  } = {}
): Promise<SearchResult[]> {
  const { topK = 50, minScore = 0.3 } = options;

  if (candidateIds.length === 0) {
    console.log(`[Two-Stage] No candidates to search`);
    return [];
  }

  console.log(`[Two-Stage] Vector search on ${candidateIds.length} candidates...`);

  // Build query with candidate ID filter
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
    candidateIds,
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

  console.log(`[Two-Stage] Vector search returned ${filtered.length} results (score >= ${minScore})`);

  return filtered;
}

/**
 * Two-Stage Hybrid Search: Metadata Filter → ANN Vector + Keyword
 */
export async function twoStageHybridSearch(
  query: string,
  videoId: string,
  options: {
    topK?: number;
    includeTranscripts?: boolean;
    includeProducts?: boolean;
    minScore?: number;
  } = {}
): Promise<SearchResult[]> {
  const {
    topK = 6,
    includeTranscripts = true,
    includeProducts = true,
    minScore = 0.3
  } = options;

  const results: SearchResult[] = [];

  // Get video metadata for filtering
  const video = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      categoryTags: true,
      brandTags: true,
      priceRangeMin: true,
      priceRangeMax: true,
      tags: true
    }
  });

  // 1. Transcripts (no filtering needed - direct hybrid search)
  if (includeTranscripts) {
    console.log(`[Two-Stage] Searching transcripts...`);
    const transcriptResults = await hybridSearch(query, {
      topK: Math.ceil(topK / 2),
      sourceType: "transcript",
      videoId,
      minScore
    });
    results.push(...transcriptResults);
    console.log(`[Two-Stage] Found ${transcriptResults.length} transcript results`);
  }

  // 2. Products (two-stage: filter → search)
  if (includeProducts && video) {
    console.log(`[Two-Stage] Searching products with two-stage...`);

    // Stage 1: Filter candidates
    const candidateIds = await filterProductCandidates(videoId, {
      categories: video.categoryTags.length > 0 ? video.categoryTags : undefined,
      brands: video.brandTags.length > 0 ? video.brandTags : undefined,
      tags: video.tags.length > 0 ? video.tags : undefined,
      priceRange: video.priceRangeMin && video.priceRangeMax
        ? [video.priceRangeMin, video.priceRangeMax]
        : undefined,
      maxCandidates: 100, // Reduced from 10,000+ to 100
    });

    if (candidateIds.length > 0) {
      // Stage 2: Vector search on candidates
      const embedding = await createEmbedding(query);
      const productResults = await vectorSearchWithFilter(
        embedding,
        candidateIds,
        {
          topK: Math.ceil(topK / 2),
          minScore: 0.3 // Relaxed threshold for better recall
        }
      );

      results.push(...productResults);
      console.log(`[Two-Stage] Found ${productResults.length} product results`);
    } else {
      console.log(`[Two-Stage] No product candidates after filtering, skipping vector search`);
    }
  }

  // Sort by score and return top K
  const sorted = results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  console.log(`[Two-Stage] Final results: ${sorted.length} total`);

  return sorted;
}

/**
 * Fallback: If video metadata not available, use regular hybrid search
 */
export async function smartHybridSearch(
  query: string,
  videoId: string,
  options: {
    topK?: number;
    includeTranscripts?: boolean;
    includeProducts?: boolean;
  } = {}
): Promise<SearchResult[]> {
  // Check if video has metadata
  const video = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: { categoryTags: true, brandTags: true }
  });

  const hasMetadata = video && (
    video.categoryTags.length > 0 ||
    video.brandTags.length > 0
  );

  if (hasMetadata) {
    console.log(`[SmartSearch] Using two-stage search (metadata available)`);
    return await twoStageHybridSearch(query, videoId, options);
  } else {
    console.log(`[SmartSearch] Using regular hybrid search (no metadata)`);

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
