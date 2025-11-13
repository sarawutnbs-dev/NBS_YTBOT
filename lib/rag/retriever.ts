import { PrismaClient } from "@prisma/client";
import { createEmbedding } from "./openai";
import { SearchQuery, SearchResult } from "./schema";

// Re-export SearchResult for convenience
export type { SearchResult };

const prisma = new PrismaClient();

/**
 * Vector similarity search using pgvector
 */
export async function vectorSearch(
  queryEmbedding: number[],
  options: {
    topK?: number;
    sourceType?: "comment" | "transcript" | "product";
    videoId?: string;
    minScore?: number;
    category?: string; // Filter by product category
  } = {}
): Promise<SearchResult[]> {
  const {
    topK = 6,
    sourceType,
    videoId,
    minScore = 0.0,
    category,
  } = options;

  // Build WHERE clause conditions
  const conditions: string[] = ["c.embedding IS NOT NULL"];
  const params: any[] = [];
  let paramIndex = 1;

  if (sourceType) {
    conditions.push(`d."sourceType" = $${paramIndex}`);
    params.push(sourceType);
    paramIndex++;
  }

  if (videoId) {
    conditions.push(`d.meta->>'videoId' = $${paramIndex}`);
    params.push(videoId);
    paramIndex++;
  }

  // Filter by category (for products)
  if (category && sourceType === "product") {
    conditions.push(`c.meta->>'category' = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  // pgvector cosine distance query
  // Note: cosine distance = 1 - cosine similarity
  // So similarity = 1 - distance
  const query = `
    SELECT
      c.id,
      c."docId",
      c."chunkIndex",
      c.text,
      c.meta,
      c."createdAt",
      d."sourceType",
      d."sourceId",
      1 - (c.embedding <=> $${paramIndex}::vector) as score
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    ${whereClause}
    ORDER BY c.embedding <=> $${paramIndex}::vector
    LIMIT $${paramIndex + 1}
  `;

  params.push(JSON.stringify(queryEmbedding));
  params.push(topK);

  try {
    const results = await prisma.$queryRawUnsafe<any[]>(query, ...params);

    // Filter by minimum score and map to SearchResult
    return results
      .filter((r) => r.score >= minScore)
      .map((r) => ({
        id: r.id,
        docId: r.docId,
        chunkIndex: r.chunkIndex,
        text: r.text,
        meta: r.meta,
        score: Math.max(0, Math.min(1, r.score)), // Clamp to [0, 1]
        sourceType: r.sourceType,
        sourceId: r.sourceId,
      }));
  } catch (error) {
    console.error("[retriever] Vector search error:", error);
    throw new Error(`Vector search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Keyword search (BM25-like) using PostgreSQL full-text search
 */
export async function keywordSearch(
  query: string,
  options: {
    topK?: number;
    sourceType?: "comment" | "transcript" | "product";
    videoId?: string;
    category?: string; // Filter by product category
  } = {}
): Promise<SearchResult[]> {
  const {
    topK = 6,
    sourceType,
    videoId,
    category,
  } = options;

  // Build WHERE clause
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (sourceType) {
    conditions.push(`d."sourceType" = $${paramIndex}`);
    params.push(sourceType);
    paramIndex++;
  }

  if (videoId) {
    conditions.push(`d.meta->>'videoId' = $${paramIndex}`);
    params.push(videoId);
    paramIndex++;
  }

  // Filter by category (for products)
  if (category && sourceType === "product") {
    conditions.push(`c.meta->>'category' = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  const whereClause = conditions.length > 0
    ? `AND ${conditions.join(" AND ")}`
    : "";

  // Use PostgreSQL's ts_rank for BM25-like ranking
  const tsQuery = query.split(/\s+/).join(" & ");

  const sql = `
    SELECT
      c.id,
      c."docId",
      c."chunkIndex",
      c.text,
      c.meta,
      c."createdAt",
      d."sourceType",
      d."sourceId",
      ts_rank(to_tsvector('english', c.text), to_tsquery('english', $${paramIndex})) as score
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE to_tsvector('english', c.text) @@ to_tsquery('english', $${paramIndex})
    ${whereClause}
    ORDER BY score DESC
    LIMIT $${paramIndex + 1}
  `;

  params.push(tsQuery);
  params.push(topK);

  try {
    const results = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    return results.map((r) => ({
      id: r.id,
      docId: r.docId,
      chunkIndex: r.chunkIndex,
      text: r.text,
      meta: r.meta,
      score: Math.max(0, Math.min(1, r.score)), // Normalize score
      sourceType: r.sourceType,
      sourceId: r.sourceId,
    }));
  } catch (error) {
    console.error("[retriever] Keyword search error:", error);
    // Return empty results on error (full-text search might fail if query is invalid)
    return [];
  }
}

/**
 * Hybrid search combining vector and keyword search with re-ranking
 */
export async function hybridSearch(
  query: string,
  options: {
    topK?: number;
    sourceType?: "comment" | "transcript" | "product";
    videoId?: string;
    minScore?: number;
    vectorWeight?: number; // Weight for vector scores (0-1)
    keywordWeight?: number; // Weight for keyword scores (0-1)
    queryEmbedding?: number[]; // Optional: pre-computed embedding
    category?: string; // Filter by product category
  } = {}
): Promise<SearchResult[]> {
  const {
    topK = 6,
    sourceType,
    videoId,
    minScore = 0.0,
    vectorWeight = 0.7,
    keywordWeight = 0.3,
    queryEmbedding: providedEmbedding,
    category,
  } = options;

  try {
    // Use provided embedding or generate new one
    const queryEmbedding = providedEmbedding || await createEmbedding(query);

    // Perform both searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      vectorSearch(queryEmbedding, {
        topK: topK * 2, // Get more results for better re-ranking
        sourceType,
        videoId,
        minScore: 0, // Don't filter yet
        category,
      }),
      keywordSearch(query, {
        topK: topK * 2,
        sourceType,
        videoId,
        category,
      }),
    ]);

    // Combine and re-rank results
    const combinedMap = new Map<number, SearchResult>();

    // Add vector results with weighted scores
    for (const result of vectorResults) {
      combinedMap.set(result.id, {
        ...result,
        score: result.score * vectorWeight,
      });
    }

    // Add keyword results with weighted scores
    for (const result of keywordResults) {
      const existing = combinedMap.get(result.id);
      if (existing) {
        // Combine scores if result appears in both
        existing.score += result.score * keywordWeight;
      } else {
        combinedMap.set(result.id, {
          ...result,
          score: result.score * keywordWeight,
        });
      }
    }

    // Convert to array, sort by combined score, filter, and limit
    const reranked = Array.from(combinedMap.values())
      .sort((a, b) => b.score - a.score)
      .filter((r) => r.score >= minScore)
      .slice(0, topK);

    console.log(
      `[retriever] Hybrid search: ${vectorResults.length} vector + ${keywordResults.length} keyword → ${reranked.length} final`
    );

    return reranked;
  } catch (error) {
    console.error("[retriever] Hybrid search error:", error);
    throw new Error(`Hybrid search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Search using query object (convenience wrapper)
 */
export async function search(searchQuery: SearchQuery): Promise<SearchResult[]> {
  return hybridSearch(searchQuery.query, {
    topK: searchQuery.topK,
    sourceType: searchQuery.sourceType,
    videoId: searchQuery.videoId,
    minScore: searchQuery.minScore,
  });
}

/**
 * Get chunks by document ID
 */
export async function getChunksByDocId(docId: number): Promise<SearchResult[]> {
  try {
    const chunks = await prisma.$queryRaw<any[]>`
      SELECT
        c.id,
        c."docId",
        c."chunkIndex",
        c.text,
        c.meta,
        c."createdAt",
        d."sourceType",
        d."sourceId",
        0.0 as score
      FROM "RagChunk" c
      JOIN "RagDocument" d ON c."docId" = d.id
      WHERE c."docId" = ${docId}
      ORDER BY c."chunkIndex"
    `;

    return chunks.map((r) => ({
      id: r.id,
      docId: r.docId,
      chunkIndex: r.chunkIndex,
      text: r.text,
      meta: r.meta,
      score: 0.0,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
    }));
  } catch (error) {
    console.error("[retriever] Get chunks by doc ID error:", error);
    throw new Error(`Failed to get chunks: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Get chunks by source
 */
export async function getChunksBySource(
  sourceType: "comment" | "transcript" | "product",
  sourceId: string
): Promise<SearchResult[]> {
  try {
    const chunks = await prisma.$queryRaw<any[]>`
      SELECT
        c.id,
        c."docId",
        c."chunkIndex",
        c.text,
        c.meta,
        c."createdAt",
        d."sourceType",
        d."sourceId",
        0.0 as score
      FROM "RagChunk" c
      JOIN "RagDocument" d ON c."docId" = d.id
      WHERE d."sourceType" = ${sourceType}
        AND d."sourceId" = ${sourceId}
      ORDER BY c."chunkIndex"
    `;

    return chunks.map((r) => ({
      id: r.id,
      docId: r.docId,
      chunkIndex: r.chunkIndex,
      text: r.text,
      meta: r.meta,
      score: 0.0,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
    }));
  } catch (error) {
    console.error("[retriever] Get chunks by source error:", error);
    throw new Error(`Failed to get chunks: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Delete document and all its chunks
 */
export async function deleteDocument(
  sourceType: "comment" | "transcript" | "product",
  sourceId: string
): Promise<boolean> {
  try {
    const result = await prisma.ragDocument.deleteMany({
      where: {
        sourceType,
        sourceId,
      },
    });

    console.log(`[retriever] Deleted ${result.count} documents (${sourceType}:${sourceId})`);
    return result.count > 0;
  } catch (error) {
    console.error("[retriever] Delete document error:", error);
    throw new Error(`Failed to delete document: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Count documents by source type
 */
export async function countDocuments(
  sourceType?: "comment" | "transcript" | "product"
): Promise<number> {
  try {
    const count = await prisma.ragDocument.count({
      where: sourceType ? { sourceType } : undefined,
    });

    return count;
  } catch (error) {
    console.error("[retriever] Count documents error:", error);
    return 0;
  }
}

/**
 * Count chunks by source type
 */
export async function countChunks(
  sourceType?: "comment" | "transcript" | "product"
): Promise<number> {
  try {
    if (sourceType) {
      const result = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::int as count
        FROM "RagChunk" c
        JOIN "RagDocument" d ON c."docId" = d.id
        WHERE d."sourceType" = ${sourceType}
      `;
      return Number(result[0].count);
    } else {
      const count = await prisma.ragChunk.count();
      return count;
    }
  } catch (error) {
    console.error("[retriever] Count chunks error:", error);
    return 0;
  }
}

/**
 * Get statistics about indexed data
 */
export async function getIndexStats(): Promise<{
  totalDocuments: number;
  totalChunks: number;
  bySourceType: {
    comments: { documents: number; chunks: number };
    transcripts: { documents: number; chunks: number };
    products: { documents: number; chunks: number };
  };
}> {
  try {
    const [
      totalDocuments,
      totalChunks,
      commentDocs,
      commentChunks,
      transcriptDocs,
      transcriptChunks,
      productDocs,
      productChunks,
    ] = await Promise.all([
      countDocuments(),
      countChunks(),
      countDocuments("comment"),
      countChunks("comment"),
      countDocuments("transcript"),
      countChunks("transcript"),
      countDocuments("product"),
      countChunks("product"),
    ]);

    return {
      totalDocuments,
      totalChunks,
      bySourceType: {
        comments: { documents: commentDocs, chunks: commentChunks },
        transcripts: { documents: transcriptDocs, chunks: transcriptChunks },
        products: { documents: productDocs, chunks: productChunks },
      },
    };
  } catch (error) {
    console.error("[retriever] Get index stats error:", error);
    throw new Error(`Failed to get index stats: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
