import { prisma } from "@/lib/db";
import { IndexStatus } from "@prisma/client";
import { ensureVideoIndexFor } from "@/lib/transcriptQueue";
import { scrapeTranscriptFromTubeTranscript } from "@/lib/transcriptScraper";
import { chunkTranscript, buildIndex, fetchVideoMeta } from "@/lib/transcript";
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
  try {
    console.log(`[ensureMissing] Starting...`);

    // Find all unique videoIds from comments
    const videoIdsFromComments = await prisma.comment.findMany({
      select: { videoId: true },
      distinct: ["videoId"],
    });

    const allVideoIds = videoIdsFromComments.map((c) => c.videoId);
    console.log(`[ensureMissing] Found ${allVideoIds.length} unique video(s) from comments`);

    if (allVideoIds.length === 0) {
      return { queued: false, count: 0, metadataUpdated: 0, total: 0 };
    }

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

    console.log(`[ensureMissing] Found ${missingVideoIds.length} video(s) needing indexing`);

    if (missingVideoIds.length > 0) {
      try {
        await ensureVideoIndexFor(new Set(missingVideoIds));
      } catch (error) {
        console.error(`[ensureMissing] Error queuing videos for indexing:`, error);
        throw new Error(`Failed to queue ${missingVideoIds.length} video(s) for indexing: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Check for videos with missing title or publishedAt
    console.log(`[ensureMissing] Checking for videos with missing title/year...`);
    const videosWithMissingInfo = await prisma.videoIndex.findMany({
      where: {
        videoId: { in: allVideoIds },
        OR: [
          { title: { equals: "" } },
          { title: null },
          { publishedAt: null },
        ],
      },
      select: {
        videoId: true,
        title: true,
        publishedAt: true,
      },
    });

    let metadataUpdatedCount = 0;

    if (videosWithMissingInfo.length > 0) {
      console.log(`[ensureMissing] Found ${videosWithMissingInfo.length} video(s) with missing title/year`);

      // Process in batches to avoid rate limiting
      const BATCH_SIZE = 5;
      const DELAY_BETWEEN_REQUESTS = 200; // 200ms delay

      for (let i = 0; i < videosWithMissingInfo.length; i++) {
        const video = videosWithMissingInfo[i];

        try {
          console.log(`[ensureMissing] Fetching metadata for ${video.videoId} (${i + 1}/${videosWithMissingInfo.length})...`);
          const meta = await fetchVideoMeta(video.videoId);

          if (meta) {
            const updateData: any = {};

            // Update title if missing
            if (!video.title || video.title === "") {
              updateData.title = meta.title || "Untitled Video";
            }

            // Update publishedAt if missing
            if (!video.publishedAt && meta.publishedAt) {
              updateData.publishedAt = new Date(meta.publishedAt);
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.videoIndex.update({
                where: { videoId: video.videoId },
                data: updateData,
              });
              metadataUpdatedCount++;
              console.log(`[ensureMissing] ✅ Updated metadata for ${video.videoId}:`, updateData);
            }
          } else {
            console.warn(`[ensureMissing] No metadata returned for ${video.videoId}`);
          }

          // Add delay between requests to avoid rate limiting
          if (i < videosWithMissingInfo.length - 1 && (i + 1) % BATCH_SIZE === 0) {
            console.log(`[ensureMissing] Batch completed, waiting ${DELAY_BETWEEN_REQUESTS}ms...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
          }
        } catch (error) {
          console.error(`[ensureMissing] Failed to fetch metadata for ${video.videoId}:`, error);
          // Continue with other videos instead of failing completely
        }
      }
    }

    const totalProcessed = missingVideoIds.length + metadataUpdatedCount;
    console.log(`[ensureMissing] ✅ Complete - Queued: ${missingVideoIds.length}, Metadata updated: ${metadataUpdatedCount}`);

    return {
      queued: true,
      count: missingVideoIds.length,
      metadataUpdated: metadataUpdatedCount,
      total: totalProcessed,
    };
  } catch (error) {
    console.error(`[ensureMissing] Fatal error:`, error);
    throw error;
  }
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
