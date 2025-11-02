/**
 * Job: Ingest Comments into RAG
 *
 * Fetches comments from database and ingests them into the RAG system.
 * Can be run manually or scheduled via cron/queue system.
 */

import { PrismaClient } from "@prisma/client";
import { ingestComments } from "@/lib/rag/ingest";
import { CommentSource } from "@/lib/rag/schema";

const prisma = new PrismaClient();

interface IngestCommentsOptions {
  videoId?: string; // Ingest comments for specific video
  limit?: number; // Limit number of comments to ingest
  overwrite?: boolean; // Overwrite existing indexed comments
  minLikes?: number; // Only ingest comments with minimum likes
  skipReplies?: boolean; // Skip reply comments
  dryRun?: boolean; // Preview without actually ingesting
}

/**
 * Main job function
 */
export async function ingestCommentsJob(options: IngestCommentsOptions = {}) {
  const {
    videoId,
    limit,
    overwrite = false,
    minLikes = 0,
    skipReplies = false,
    dryRun = false,
  } = options;

  console.log("[job:ingest-comments] Starting...");
  console.log("[job:ingest-comments] Options:", options);

  try {
    // Build where clause for fetching comments
    const whereClause: any = {};

    if (videoId) {
      whereClause.videoId = videoId;
    }

    if (minLikes > 0) {
      whereClause.likeCount = { gte: minLikes };
    }

    if (skipReplies) {
      whereClause.parentId = null;
    }

    // Fetch comments from database
    // Note: Adjust this query based on your actual Comment model structure
    const comments = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        c."commentId",
        c."videoId",
        c."authorName",
        c."text",
        c."publishedAt",
        c."likeCount",
        CASE WHEN c."parentId" IS NOT NULL THEN true ELSE false END as "isReply",
        c."parentId"
      FROM "Comment" c
      ${videoId ? `WHERE c."videoId" = '${videoId}'` : ''}
      ${minLikes > 0 ? `${videoId ? 'AND' : 'WHERE'} c."likeCount" >= ${minLikes}` : ''}
      ${skipReplies ? `${videoId || minLikes > 0 ? 'AND' : 'WHERE'} c."parentId" IS NULL` : ''}
      ORDER BY c."likeCount" DESC, c."publishedAt" DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `);

    if (comments.length === 0) {
      console.log("[job:ingest-comments] No comments found to ingest");
      return {
        success: true,
        processed: 0,
        successful: 0,
        failed: 0,
      };
    }

    console.log(`[job:ingest-comments] Found ${comments.length} comments to ingest`);

    if (dryRun) {
      console.log("[job:ingest-comments] DRY RUN - No actual ingestion");
      console.log("[job:ingest-comments] Sample comments:", comments.slice(0, 3));
      return {
        success: true,
        processed: 0,
        successful: 0,
        failed: 0,
        dryRun: true,
        previewCount: comments.length,
      };
    }

    // Convert to CommentSource format
    const commentSources: CommentSource[] = comments.map((c) => ({
      commentId: c.commentId,
      videoId: c.videoId,
      authorName: c.authorName,
      text: c.text,
      publishedAt: c.publishedAt?.toISOString(),
      likeCount: c.likeCount || 0,
      isReply: c.isReply || false,
      parentId: c.parentId || undefined,
    }));

    // Ingest in batches of 50
    const batchSize = 50;
    let totalSuccessful = 0;
    let totalFailed = 0;

    for (let i = 0; i < commentSources.length; i += batchSize) {
      const batch = commentSources.slice(i, i + batchSize);

      console.log(
        `[job:ingest-comments] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(commentSources.length / batchSize)}`
      );

      const result = await ingestComments(batch, overwrite);

      totalSuccessful += result.successful;
      totalFailed += result.failed;

      if (result.errors.length > 0) {
        console.error(
          `[job:ingest-comments] Batch errors:`,
          result.errors.slice(0, 5)
        );
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < commentSources.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`[job:ingest-comments] Completed: ${totalSuccessful} successful, ${totalFailed} failed`);

    return {
      success: totalFailed === 0,
      processed: comments.length,
      successful: totalSuccessful,
      failed: totalFailed,
    };
  } catch (error) {
    console.error("[job:ingest-comments] Error:", error);
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
  const options: IngestCommentsOptions = {};

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
    } else if (arg === "--min-likes" && args[i + 1]) {
      options.minLikes = parseInt(args[i + 1]);
      i++;
    } else if (arg === "--skip-replies") {
      options.skipReplies = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help") {
      console.log(`
Usage: npx tsx jobs/ingest-comments.ts [options]

Options:
  --video-id <id>       Only ingest comments for specific video
  --limit <number>      Limit number of comments to ingest
  --overwrite           Overwrite existing indexed comments
  --min-likes <number>  Only ingest comments with minimum likes
  --skip-replies        Skip reply comments (only top-level)
  --dry-run             Preview without actually ingesting
  --help                Show this help message

Examples:
  npx tsx jobs/ingest-comments.ts --video-id abc123 --limit 100
  npx tsx jobs/ingest-comments.ts --min-likes 5 --skip-replies
  npx tsx jobs/ingest-comments.ts --dry-run
      `);
      process.exit(0);
    }
  }

  ingestCommentsJob(options)
    .then((result) => {
      console.log("[job:ingest-comments] Result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("[job:ingest-comments] Fatal error:", error);
      process.exit(1);
    });
}
