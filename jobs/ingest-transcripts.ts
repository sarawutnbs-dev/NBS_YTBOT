/**
 * Job: Ingest Video Transcripts into RAG
 *
 * Fetches video transcripts from VideoIndex table and ingests them into the RAG system.
 * Can be run manually or scheduled via cron/queue system.
 */

import { PrismaClient } from "@prisma/client";
import { ingestTranscripts } from "@/lib/rag/ingest";
import { TranscriptSource } from "@/lib/rag/schema";

const prisma = new PrismaClient();

interface IngestTranscriptsOptions {
  videoId?: string; // Ingest specific video
  limit?: number; // Limit number of videos to ingest
  overwrite?: boolean; // Overwrite existing indexed transcripts
  minViews?: number; // Only ingest videos with minimum views
  onlyRecent?: boolean; // Only ingest recent videos (last 30 days)
  dryRun?: boolean; // Preview without actually ingesting
}

/**
 * Main job function
 */
export async function ingestTranscriptsJob(options: IngestTranscriptsOptions = {}) {
  const {
    videoId,
    limit,
    overwrite = false,
    minViews = 0,
    onlyRecent = false,
    dryRun = false,
  } = options;

  console.log("[job:ingest-transcripts] Starting...");
  console.log("[job:ingest-transcripts] Options:", options);

  try {
    // Build where clause
    const conditions: string[] = [
      `v."transcriptStatus" = 'completed'`,
      `v."transcript" IS NOT NULL`,
      `v."transcript" != ''`,
    ];

    if (videoId) {
      conditions.push(`v."videoId" = '${videoId}'`);
    }

    if (minViews > 0) {
      conditions.push(`v."viewCount" >= ${minViews}`);
    }

    if (onlyRecent) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      conditions.push(`v."publishedAt" >= '${thirtyDaysAgo.toISOString()}'`);
    }

    const whereClause = conditions.join(" AND ");

    // Fetch transcripts from database
    const videos = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        v."videoId",
        v."title",
        v."channelName",
        v."publishedAt",
        v."transcript",
        v."duration",
        v."viewCount"
      FROM "VideoIndex" v
      WHERE ${whereClause}
      ORDER BY v."publishedAt" DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `);

    if (videos.length === 0) {
      console.log("[job:ingest-transcripts] No transcripts found to ingest");
      return {
        success: true,
        processed: 0,
        successful: 0,
        failed: 0,
      };
    }

    console.log(`[job:ingest-transcripts] Found ${videos.length} transcripts to ingest`);

    if (dryRun) {
      console.log("[job:ingest-transcripts] DRY RUN - No actual ingestion");
      console.log("[job:ingest-transcripts] Sample videos:", videos.slice(0, 3).map(v => ({
        videoId: v.videoId,
        title: v.title,
        transcriptLength: v.transcript?.length,
      })));
      return {
        success: true,
        processed: 0,
        successful: 0,
        failed: 0,
        dryRun: true,
        previewCount: videos.length,
      };
    }

    // Convert to TranscriptSource format
    const transcriptSources: TranscriptSource[] = videos.map((v) => ({
      videoId: v.videoId,
      title: v.title || "Untitled Video",
      channelName: v.channelName || "Unknown Channel",
      publishedAt: v.publishedAt?.toISOString(),
      transcript: v.transcript,
      duration: v.duration || undefined,
      viewCount: v.viewCount || undefined,
    }));

    // Ingest in batches of 10 (transcripts take longer to process)
    const batchSize = 10;
    let totalSuccessful = 0;
    let totalFailed = 0;

    for (let i = 0; i < transcriptSources.length; i += batchSize) {
      const batch = transcriptSources.slice(i, i + batchSize);

      console.log(
        `[job:ingest-transcripts] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(transcriptSources.length / batchSize)}`
      );

      const result = await ingestTranscripts(batch, overwrite);

      totalSuccessful += result.successful;
      totalFailed += result.failed;

      if (result.errors.length > 0) {
        console.error(
          `[job:ingest-transcripts] Batch errors:`,
          result.errors.slice(0, 5)
        );
      }

      // Delay between batches to avoid rate limits (embeddings can be expensive)
      if (i + batchSize < transcriptSources.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(`[job:ingest-transcripts] Completed: ${totalSuccessful} successful, ${totalFailed} failed`);

    return {
      success: totalFailed === 0,
      processed: videos.length,
      successful: totalSuccessful,
      failed: totalFailed,
    };
  } catch (error) {
    console.error("[job:ingest-transcripts] Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * CLI runner
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: IngestTranscriptsOptions = {};

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--video-id" && args[i + 1]) {
      options.videoId = args[i + 1];
      i++;
    } else if (arg === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else if (arg === "--min-views" && args[i + 1]) {
      options.minViews = parseInt(args[i + 1]);
      i++;
    } else if (arg === "--only-recent") {
      options.onlyRecent = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help") {
      console.log(`
Usage: npx tsx jobs/ingest-transcripts.ts [options]

Options:
  --video-id <id>       Only ingest specific video
  --limit <number>      Limit number of videos to ingest
  --overwrite           Overwrite existing indexed transcripts
  --min-views <number>  Only ingest videos with minimum views
  --only-recent         Only ingest recent videos (last 30 days)
  --dry-run             Preview without actually ingesting
  --help                Show this help message

Examples:
  npx tsx jobs/ingest-transcripts.ts --video-id abc123
  npx tsx jobs/ingest-transcripts.ts --limit 10 --only-recent
  npx tsx jobs/ingest-transcripts.ts --min-views 1000
  npx tsx jobs/ingest-transcripts.ts --dry-run
      `);
      process.exit(0);
    }
  }

  ingestTranscriptsJob(options)
    .then((result) => {
      console.log("[job:ingest-transcripts] Result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("[job:ingest-transcripts] Fatal error:", error);
      process.exit(1);
    });
}
