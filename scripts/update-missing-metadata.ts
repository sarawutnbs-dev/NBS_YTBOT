import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "@/lib/db";
import { fetchVideoMeta } from "@/lib/transcript";

/**
 * Script to update missing title and publishedAt for videos in VideoIndex table
 *
 * Usage:
 *   npx tsx scripts/update-missing-metadata.ts [--limit=N] [--dry-run]
 *
 * Options:
 *   --limit=N    Process only N videos (default: all)
 *   --dry-run    Show what would be updated without actually updating
 */

async function updateMissingMetadata() {
  const args = process.argv.slice(2);
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const isDryRun = args.includes("--dry-run");
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

  console.log("\n========================================");
  console.log("Update Missing Metadata Script");
  console.log("========================================\n");

  if (isDryRun) {
    console.log("🔍 DRY RUN MODE - No changes will be made\n");
  }

  // Find videos with missing title or publishedAt
  console.log("1. Finding videos with missing metadata...");
  const videosWithMissingInfo = await prisma.videoIndex.findMany({
    where: {
      OR: [
        { title: "" },
        { publishedAt: null },
      ],
    },
    select: {
      videoId: true,
      title: true,
      publishedAt: true,
      status: true,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  if (videosWithMissingInfo.length === 0) {
    console.log("✅ No videos found with missing metadata. All good!");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nFound ${videosWithMissingInfo.length} video(s) with missing metadata:`);
  videosWithMissingInfo.forEach((v, idx) => {
    const issues = [];
    if (!v.title || v.title === "") issues.push("no title");
    if (!v.publishedAt) issues.push("no publishedAt");
    console.log(`   ${idx + 1}. ${v.videoId} - Status: ${v.status} - Issues: ${issues.join(", ")}`);
  });

  console.log("\n2. Fetching metadata from YouTube API...\n");

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const errors: Array<{ videoId: string; error: string }> = [];

  for (let i = 0; i < videosWithMissingInfo.length; i++) {
    const video = videosWithMissingInfo[i];
    const progress = `[${i + 1}/${videosWithMissingInfo.length}]`;

    try {
      console.log(`${progress} Fetching metadata for ${video.videoId}...`);

      const meta = await fetchVideoMeta(video.videoId);

      if (!meta) {
        console.log(`${progress} ⚠️  No metadata returned for ${video.videoId}`);
        skipCount++;
        continue;
      }

      const updateData: any = {};

      // Update title if missing
      if (!video.title || video.title === "") {
        if (meta.title) {
          updateData.title = meta.title;
          console.log(`${progress}    📝 Title: "${meta.title}"`);
        }
      }

      // Update publishedAt if missing
      if (!video.publishedAt) {
        if (meta.publishedAt) {
          updateData.publishedAt = new Date(meta.publishedAt);
          const year = new Date(meta.publishedAt).getFullYear();
          console.log(`${progress}    📅 Year: ${year}`);
        }
      }

      if (Object.keys(updateData).length === 0) {
        console.log(`${progress} ⏭️  No updates needed for ${video.videoId}`);
        skipCount++;
        continue;
      }

      if (!isDryRun) {
        await prisma.videoIndex.update({
          where: { videoId: video.videoId },
          data: updateData,
        });
        console.log(`${progress} ✅ Updated ${video.videoId}`);
      } else {
        console.log(`${progress} 🔍 Would update ${video.videoId}:`, updateData);
      }

      successCount++;

      // Add delay to avoid rate limiting (100ms between requests)
      if (i < videosWithMissingInfo.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${progress} ❌ Error fetching metadata for ${video.videoId}:`, errorMessage);
      errors.push({ videoId: video.videoId, error: errorMessage });
      errorCount++;

      // If we get invalid_grant error, stop immediately
      if (errorMessage.includes("invalid_grant") || errorMessage.includes("Token has been expired")) {
        console.error("\n🔴 CRITICAL: YouTube OAuth token has expired or been revoked!");
        console.error("   Please refresh your OAuth token in .env.local:");
        console.error("   - YOUTUBE_CLIENT_ID");
        console.error("   - YOUTUBE_CLIENT_SECRET");
        console.error("   - YOUTUBE_REFRESH_TOKEN\n");
        break;
      }

      // Continue with other videos for other types of errors
      continue;
    }
  }

  console.log("\n========================================");
  console.log("Summary");
  console.log("========================================");
  console.log(`Total videos checked: ${videosWithMissingInfo.length}`);
  console.log(`✅ Successfully updated: ${successCount}`);
  console.log(`⏭️  Skipped: ${skipCount}`);
  console.log(`❌ Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log("\n🔴 Errors encountered:");
    errors.forEach((err) => {
      console.log(`   - ${err.videoId}: ${err.error}`);
    });
  }

  if (isDryRun) {
    console.log("\n🔍 This was a DRY RUN - no changes were made");
    console.log("   Run without --dry-run to apply changes");
  }

  console.log("\n========================================\n");

  await prisma.$disconnect();
}

updateMissingMetadata().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
