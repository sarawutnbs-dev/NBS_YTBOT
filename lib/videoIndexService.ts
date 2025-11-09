import { prisma } from "@/lib/db";
import { IndexStatus } from "@prisma/client";
import { ensureVideoIndexFor } from "@/lib/transcriptQueue";
import { scrapeTranscriptFromTubeTranscript } from "@/lib/transcriptScraper";
import { chunkTranscript, buildIndex } from "@/lib/transcript";
import { ingestTranscript } from "@/lib/rag/ingest";

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

export async function ensureVideoIndex(videoId: string, opts?: { forceReindex?: boolean }) {
  const forceReindex = opts?.forceReindex ?? false;

  const existing = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      status: true,
      chunksJSON: true,
      summaryJSON: true,
      source: true,
      errorMessage: true,
    },
  });

  const hasProcessedData = !!existing?.chunksJSON || !!existing?.summaryJSON;

  // Auto-heal: chunks already exist but status never flipped to READY
  if (!forceReindex && existing && existing.status === IndexStatus.INDEXING && hasProcessedData) {
    await prisma.videoIndex.update({
      where: { videoId },
      data: {
        status: IndexStatus.READY,
        errorMessage: null,
        source: existing.source ?? "tubetranscript",
      },
    });
    return { queued: false, reason: "already_processed" };
  }

  if (forceReindex && existing) {
    await prisma.videoIndex.update({
      where: { videoId },
      data: {
        status: IndexStatus.NONE,
        chunksJSON: null,
        summaryJSON: null,
        source: null,
        errorMessage: null,
      },
    });
  }

  // Skip if already READY or actively indexing without forcing
  if (!forceReindex && existing && (existing.status === IndexStatus.READY || existing.status === IndexStatus.INDEXING)) {
    return { queued: false, reason: "already_processing_or_ready" };
  }

  // Queue for indexing
  await ensureVideoIndexFor(new Set([videoId]));

  let fallback: ScrapeResult | undefined;

  if (forceReindex) {
    fallback = await scrapeAndProcessTranscript(videoId);
  } else {
    Promise.resolve().then(async () => {
      const result = await scrapeAndProcessTranscript(videoId);
      if (!result.ok) {
        console.log(`[ensureVideoIndex] Background fallback skipped for ${videoId}: ${result.reason}`);
      }
    });
  }

  return { queued: true, forceReindex, fallback };
}

type ScrapeResult = { ok: boolean; reason?: string; chunks?: number };

async function scrapeAndProcessTranscript(videoId: string, delayMs = 15000): Promise<ScrapeResult> {
  try {
    const current = await prisma.videoIndex.findUnique({ where: { videoId } });

    if (!current) {
      return { ok: false, reason: "missing_video_index" };
    }

    if (current.status !== IndexStatus.INDEXING) {
      return { ok: false, reason: "not_indexing" };
    }

    if (current.chunksJSON || current.summaryJSON) {
      return { ok: false, reason: "already_has_chunks" };
    }

    console.log(`[transcriptFallback] Attempting to scrape transcript from TubeTranscript...`);
    const text: string | null = await scrapeTranscriptFromTubeTranscript(videoId, delayMs);

    if (!text || text.length < 200) {
      await prisma.videoIndex.update({
        where: { videoId },
        data: {
          status: IndexStatus.FAILED,
          errorMessage: "scraper returned insufficient text",
        },
      });

      return { ok: false, reason: "scraper_returned_insufficient_text" };
    }

    const chunks = chunkTranscript(text);
    const { summaryJSON } = await buildIndex(chunks);

    try {
      await ingestTranscript(
        {
          videoId,
          title: current.title || "Untitled Video",
          channelName: "Unknown Channel",
          transcript: text,
          publishedAt: current.publishedAt?.toISOString(),
          duration: undefined,
          viewCount: undefined,
        },
        false
      );
    } catch (ingestError) {
      console.error(`[transcriptFallback] RAG ingest failed for ${videoId} (non-critical)`, ingestError);
    }

    const updateResult = await prisma.videoIndex.updateMany({
      where: { videoId, status: IndexStatus.INDEXING },
      data: {
        status: IndexStatus.READY,
        source: "tubetranscript",
        chunksJSON: JSON.stringify(chunks),
        summaryJSON: JSON.stringify(summaryJSON),
        errorMessage: null,
      },
    });

    if (updateResult.count === 0) {
      return { ok: false, reason: "status_changed_before_update" };
    }

    console.log(`[transcriptFallback] ✅ Completed fallback for ${videoId} (${chunks.length} chunks)`);
    return { ok: true, chunks: chunks.length };
  } catch (e) {
    console.error(`[transcriptFallback] Failed for ${videoId}`, e);

    try {
      await prisma.videoIndex.update({
        where: { videoId },
        data: { status: IndexStatus.FAILED, errorMessage: (e as Error).message ?? "scrape failed" },
      });
    } catch (inner) {
      console.error(`[transcriptFallback] Failed to mark ${videoId} as FAILED`, inner);
    }

    return { ok: false, reason: "exception" };
  }
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

/**
 * Scrape transcripts for all videos missing transcripts.
 * - Determine candidate videoIds from comments that are not READY and not currently INDEXING with chunks.
 * - Upsert VideoIndex rows to INDEXING for missing ones.
 * - Fire-and-forget background tasks to scrape and process sequentially.
 * Returns quickly with queued count.
 */
export async function scrapeMissing() {
  // 1) Collect all videoIds referenced by comments
  const videoIdsFromComments = await prisma.comment.findMany({
    select: { videoId: true },
    distinct: ["videoId"],
  });
  const allVideoIds = videoIdsFromComments.map((c) => c.videoId);

  if (allVideoIds.length === 0) return { queued: false, count: 0 };

  // 2) Get current VideoIndex rows
  const indexes = await prisma.videoIndex.findMany({
    where: { videoId: { in: allVideoIds } },
    select: { videoId: true, status: true, chunksJSON: true, summaryJSON: true },
  });
  const byId = new Map(indexes.map((v) => [v.videoId, v]));

  // 3) Candidates: NOT READY with chunks AND not currently READY
  const candidates: string[] = [];
  for (const vid of allVideoIds) {
    const vi = byId.get(vid);
    const hasChunks = !!vi?.chunksJSON || !!vi?.summaryJSON;
    if (!vi) {
      candidates.push(vid);
    } else if (vi.status !== IndexStatus.READY && !hasChunks) {
      candidates.push(vid);
    }
  }

  if (candidates.length === 0) return { queued: false, count: 0 };

  // 4) Upsert to INDEXING for candidates (so UI shows progress and scraper guards work)
  await Promise.all(
    candidates.map((videoId) =>
      prisma.videoIndex.upsert({
        where: { videoId },
        update: { status: IndexStatus.INDEXING, errorMessage: "awaiting scraped transcript" },
        create: { videoId, title: "", status: IndexStatus.INDEXING, errorMessage: "awaiting scraped transcript" },
      })
    )
  );

  // 5) Background sequential scrape + process to avoid heavy concurrent Playwright sessions
  Promise.resolve().then(async () => {
    for (const videoId of candidates) {
      const result = await scrapeAndProcessTranscript(videoId);
      if (!result.ok) {
        console.log(`[scrapeMissing] Skipped ${videoId}: ${result.reason}`);
      }
    }
  });

  return { queued: true, count: candidates.length };
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
