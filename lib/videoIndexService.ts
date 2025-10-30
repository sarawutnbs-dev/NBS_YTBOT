import { prisma } from "@/lib/db";
import { IndexStatus } from "@prisma/client";
import { ensureVideoIndexFor } from "@/lib/transcriptQueue";

export type VideoIndexListItem = {
  videoId: string;
  title: string;
  status: IndexStatus;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type VideoPreview = {
  videoId: string;
  title: string;
  status: IndexStatus;
  source?: string | null; // "captions" | "github"
  summary: {
    totalChunks: number;
    keywords: string[];
    topics: string[];
    outline?: string[];
  };
  chunks: Array<{
    ts: string;
    text: string;
  }>;
};

export async function listVideoIndex(params: {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { q, status, page = 1, pageSize = 20 } = params;
  const skip = (page - 1) * pageSize;

  const where: any = {};

  // Search by title or videoId
  if (q && q.trim()) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { videoId: { contains: q, mode: "insensitive" } },
    ];
  }

  // Filter by status
  if (status && status !== "ALL") {
    where.status = status as IndexStatus;
  }

  const [items, total] = await Promise.all([
    prisma.videoIndex.findMany({
      where,
      select: {
        videoId: true,
        title: true,
        status: true,
        updatedAt: true,
        publishedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.videoIndex.count({ where }),
  ]);

  return {
    items: items as VideoIndexListItem[],
    total,
  };
}

export async function ensureVideoIndex(videoId: string) {
  const existing = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: { status: true },
  });

  // Skip if already READY or INDEXING
  if (existing && (existing.status === IndexStatus.READY || existing.status === IndexStatus.INDEXING)) {
    return { queued: false, reason: "already_processing_or_ready" };
  }

  // Queue for indexing
  await ensureVideoIndexFor(new Set([videoId]));

  return { queued: true };
}

export async function ensureMissing() {
  // Find all unique videoIds from comments
  const videoIdsFromComments = await prisma.comment.findMany({
    select: { videoId: true },
    distinct: ["videoId"],
  });

  const allVideoIds = videoIdsFromComments.map((c) => c.videoId);

  // Find which ones don't have READY or INDEXING status
  const existingIndexes = await prisma.videoIndex.findMany({
    where: {
      videoId: { in: allVideoIds },
      status: { in: [IndexStatus.READY, IndexStatus.INDEXING] },
    },
    select: { videoId: true },
  });

  const existingSet = new Set(existingIndexes.map((v) => v.videoId));
  const missingVideoIds = allVideoIds.filter((vid) => !existingSet.has(vid));

  if (missingVideoIds.length > 0) {
    await ensureVideoIndexFor(new Set(missingVideoIds));
  }

  return { queued: true, count: missingVideoIds.length };
}

export async function getPreview(videoId: string): Promise<VideoPreview | null> {
  const videoIndex = await prisma.videoIndex.findUnique({
    where: { videoId },
  });

  if (!videoIndex) {
    return null;
  }

  let summary = {
    totalChunks: 0,
    keywords: [],
    topics: [],
    outline: [],
  };

  let chunks: Array<{ ts: string; text: string }> = [];

  // Parse summaryJSON
  if (videoIndex.summaryJSON) {
    try {
      summary = JSON.parse(videoIndex.summaryJSON);
    } catch (e) {
      console.error("Failed to parse summaryJSON:", e);
    }
  }

  // Parse chunksJSON
  if (videoIndex.chunksJSON) {
    try {
      const rawChunks = JSON.parse(videoIndex.chunksJSON) as string[];
      chunks = rawChunks.map((text, idx) => ({
        ts: `Chunk ${idx + 1}`,
        text,
      }));
    } catch (e) {
      console.error("Failed to parse chunksJSON:", e);
    }
  }

  return {
    videoId: videoIndex.videoId,
    title: videoIndex.title,
    status: videoIndex.status,
    source: videoIndex.source,
    summary,
    chunks,
  };
}
