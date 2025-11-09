import { prisma } from "../lib/db";
import { IndexStatus } from "@prisma/client";
import { indexVideo } from "../jobs/indexVideo";

async function main() {
  console.log("🔧 Finding FAILED videos to retry...\n");

  const failed = await prisma.videoIndex.findMany({
    where: {
      status: IndexStatus.FAILED,
    },
    select: {
      videoId: true,
      title: true,
      errorMessage: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  console.log(`Found ${failed.length} FAILED video(s)\n`);

  if (failed.length === 0) {
    console.log("✅ No failed videos found!");
    await prisma.$disconnect();
    return;
  }

  // Show list of failed videos
  failed.forEach((video, idx) => {
    console.log(`${idx + 1}. ${video.videoId} - ${video.title || "(No title)"}`);
    console.log(`   Error: ${video.errorMessage || "N/A"}`);
    console.log(`   Updated: ${video.updatedAt.toISOString()}`);
    console.log();
  });

  // Reset to NONE status first
  console.log("🔄 Resetting videos to NONE status...");
  await prisma.videoIndex.updateMany({
    where: {
      videoId: { in: failed.map((v) => v.videoId) },
    },
    data: {
      status: IndexStatus.NONE,
      errorMessage: null,
    },
  });

  console.log("✅ Reset complete\n");
  console.log("🚀 Re-indexing videos with TubeTranscript scraper...\n");

  // Re-index each video
  for (const video of failed) {
    console.log(`\n📹 Processing: ${video.videoId}`);
    console.log(`   Title: ${video.title || "(No title)"}`);

    try {
      const result = await indexVideo({ videoId: video.videoId });
      console.log(`   ✅ Status: ${result.status}`);

      if (result.status === IndexStatus.READY) {
        console.log(`   🎉 Successfully indexed with transcript!`);
      }
    } catch (error) {
      console.error(`   ❌ Error:`, error instanceof Error ? error.message : error);
    }

    // Add delay between videos to be respectful to TubeTranscript
    if (failed.indexOf(video) < failed.length - 1) {
      console.log("   ⏳ Waiting 3s before next video...");
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log("\n✅ All videos processed!");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
