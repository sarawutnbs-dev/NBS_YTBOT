/**
 * RAG Statistics and Analytics
 *
 * Provides detailed statistics about the RAG system including:
 * - Document and chunk counts
 * - Embedding coverage
 * - Storage usage
 * - Query performance metrics
 */

import { PrismaClient } from "@prisma/client";
import { getIndexStats } from "./retriever";

const prisma = new PrismaClient();

export interface RagStats {
  overview: {
    totalDocuments: number;
    totalChunks: number;
    chunksWithEmbeddings: number;
    embeddingCoverage: number; // Percentage
    estimatedStorageKB: number;
  };
  bySourceType: {
    comments: {
      documents: number;
      chunks: number;
      avgChunksPerDoc: number;
    };
    transcripts: {
      documents: number;
      chunks: number;
      avgChunksPerDoc: number;
    };
    products: {
      documents: number;
      chunks: number;
      avgChunksPerDoc: number;
    };
  };
  recentActivity: {
    documentsLast24h: number;
    documentsLast7d: number;
    chunksLast24h: number;
    chunksLast7d: number;
  };
  topVideos?: Array<{
    videoId: string;
    title: string;
    chunks: number;
  }>;
  embeddingModel: {
    model: string;
    dimensions: number;
  };
}

/**
 * Get comprehensive RAG statistics
 */
export async function getRagStats(): Promise<RagStats> {
  try {
    // Get basic index stats
    const indexStats = await getIndexStats();

    // Count chunks with embeddings
    const chunksWithEmbeddings = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::int as count
      FROM "RagChunk"
      WHERE embedding IS NOT NULL
    `;

    const totalChunksWithEmbeddings = Number(chunksWithEmbeddings[0].count);

    // Calculate embedding coverage
    const embeddingCoverage = indexStats.totalChunks > 0
      ? (totalChunksWithEmbeddings / indexStats.totalChunks) * 100
      : 0;

    // Estimate storage (rough calculation)
    // Each embedding: 1536 dimensions * 4 bytes (float32) = 6144 bytes ≈ 6 KB
    // Plus text storage (avg 300 chars = 300 bytes)
    const estimatedStorageKB = Math.round(
      (totalChunksWithEmbeddings * 6.144) + // Embeddings
      (indexStats.totalChunks * 0.3) // Text
    );

    // Calculate averages
    const commentAvg = indexStats.bySourceType.comments.documents > 0
      ? indexStats.bySourceType.comments.chunks / indexStats.bySourceType.comments.documents
      : 0;

    const transcriptAvg = indexStats.bySourceType.transcripts.documents > 0
      ? indexStats.bySourceType.transcripts.chunks / indexStats.bySourceType.transcripts.documents
      : 0;

    const productAvg = indexStats.bySourceType.products.documents > 0
      ? indexStats.bySourceType.products.chunks / indexStats.bySourceType.products.documents
      : 0;

    // Get recent activity (last 24h and 7d)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [docs24h, docs7d, chunks24h, chunks7d] = await Promise.all([
      prisma.ragDocument.count({
        where: { createdAt: { gte: oneDayAgo } },
      }),
      prisma.ragDocument.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.ragChunk.count({
        where: { createdAt: { gte: oneDayAgo } },
      }),
      prisma.ragChunk.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
    ]);

    // Get top videos by chunk count (transcripts only)
    const topVideos = await prisma.$queryRaw<Array<{
      videoId: string;
      title: string;
      chunks: bigint;
    }>>`
      SELECT
        d."sourceId" as "videoId",
        d.meta->>'title' as title,
        COUNT(c.id)::int as chunks
      FROM "RagDocument" d
      JOIN "RagChunk" c ON c."docId" = d.id
      WHERE d."sourceType" = 'transcript'
      GROUP BY d."sourceId", d.meta->>'title'
      ORDER BY COUNT(c.id) DESC
      LIMIT 10
    `;

    return {
      overview: {
        totalDocuments: indexStats.totalDocuments,
        totalChunks: indexStats.totalChunks,
        chunksWithEmbeddings: totalChunksWithEmbeddings,
        embeddingCoverage: Math.round(embeddingCoverage * 100) / 100,
        estimatedStorageKB,
      },
      bySourceType: {
        comments: {
          documents: indexStats.bySourceType.comments.documents,
          chunks: indexStats.bySourceType.comments.chunks,
          avgChunksPerDoc: Math.round(commentAvg * 100) / 100,
        },
        transcripts: {
          documents: indexStats.bySourceType.transcripts.documents,
          chunks: indexStats.bySourceType.transcripts.chunks,
          avgChunksPerDoc: Math.round(transcriptAvg * 100) / 100,
        },
        products: {
          documents: indexStats.bySourceType.products.documents,
          chunks: indexStats.bySourceType.products.chunks,
          avgChunksPerDoc: Math.round(productAvg * 100) / 100,
        },
      },
      recentActivity: {
        documentsLast24h: docs24h,
        documentsLast7d: docs7d,
        chunksLast24h: chunks24h,
        chunksLast7d: chunks7d,
      },
      topVideos: topVideos.map((v) => ({
        videoId: v.videoId,
        title: v.title || "Untitled",
        chunks: Number(v.chunks),
      })),
      embeddingModel: {
        model: process.env.EMBED_MODEL || "text-embedding-3-small",
        dimensions: parseInt(process.env.EMBED_DIMENSIONS || "1536"),
      },
    };
  } catch (error) {
    console.error("[stats] Error getting RAG stats:", error);
    throw new Error(
      `Failed to get RAG stats: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get health status of RAG system
 */
export async function getRagHealth(): Promise<{
  status: "healthy" | "warning" | "error";
  issues: string[];
  checks: {
    databaseConnected: boolean;
    hasDocuments: boolean;
    hasEmbeddings: boolean;
    embeddingCoverageOk: boolean;
  };
}> {
  const issues: string[] = [];
  const checks = {
    databaseConnected: false,
    hasDocuments: false,
    hasEmbeddings: false,
    embeddingCoverageOk: false,
  };

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    checks.databaseConnected = true;

    // Check if we have documents
    const docCount = await prisma.ragDocument.count();
    checks.hasDocuments = docCount > 0;

    if (!checks.hasDocuments) {
      issues.push("No documents indexed yet");
    }

    // Check if we have embeddings
    const embCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::int as count
      FROM "RagChunk"
      WHERE embedding IS NOT NULL
    `;
    const embeddingCount = Number(embCount[0].count);
    checks.hasEmbeddings = embeddingCount > 0;

    if (!checks.hasEmbeddings && checks.hasDocuments) {
      issues.push("Documents exist but no embeddings generated");
    }

    // Check embedding coverage
    const chunkCount = await prisma.ragChunk.count();
    const coverage = chunkCount > 0 ? (embeddingCount / chunkCount) * 100 : 0;
    checks.embeddingCoverageOk = coverage >= 90;

    if (coverage < 90 && coverage > 0) {
      issues.push(`Embedding coverage is ${Math.round(coverage)}% (should be >90%)`);
    }

    // Determine overall status
    let status: "healthy" | "warning" | "error" = "healthy";

    if (!checks.databaseConnected) {
      status = "error";
      issues.push("Database connection failed");
    } else if (issues.length > 2) {
      status = "error";
    } else if (issues.length > 0) {
      status = "warning";
    }

    return {
      status,
      issues,
      checks,
    };
  } catch (error) {
    console.error("[stats] Error checking RAG health:", error);

    return {
      status: "error",
      issues: [`Health check failed: ${error instanceof Error ? error.message : "Unknown error"}`],
      checks: {
        databaseConnected: false,
        hasDocuments: false,
        hasEmbeddings: false,
        embeddingCoverageOk: false,
      },
    };
  }
}

/**
 * Get query performance metrics
 */
export async function getQueryMetrics(): Promise<{
  avgQueryTime: number | null;
  totalQueries: number;
  queriesLast24h: number;
  queriesLast7d: number;
}> {
  // This is a placeholder - you'd need to implement query logging first
  // For now, return mock data
  return {
    avgQueryTime: null,
    totalQueries: 0,
    queriesLast24h: 0,
    queriesLast7d: 0,
  };
}

/**
 * Get document details by ID
 */
export async function getDocumentDetails(docId: number): Promise<{
  document: any;
  chunks: Array<{
    id: number;
    chunkIndex: number;
    text: string;
    tokens: number;
    hasEmbedding: boolean;
  }>;
}> {
  try {
    const document = await prisma.ragDocument.findUnique({
      where: { id: docId },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    const chunks = await prisma.ragChunk.findMany({
      where: { docId },
      orderBy: { chunkIndex: "asc" },
    });

    const { countTokens } = await import("./tokenizer");

    return {
      document,
      chunks: chunks.map((c) => ({
        id: c.id,
        chunkIndex: c.chunkIndex,
        text: c.text,
        tokens: countTokens(c.text),
        hasEmbedding: c.embedding !== null,
      })),
    };
  } catch (error) {
    console.error("[stats] Error getting document details:", error);
    throw new Error(
      `Failed to get document details: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
