import { prisma } from "../lib/db";
import { IndexStatus } from "@prisma/client";
import { indexVideo } from "../jobs/indexVideo";

async function main() {
  console.log("🔧 Finding videos stuck in INDEXING status...\n");

  const stuck = await prisma.videoIndex.findMany({
    where: {
      status: IndexStatus.INDEXING,
      // Only retry if no chunks (truly stuck, not in progress)
      chunksJSON: null,
    },
    select: {
      videoId: true,
      title: true,
      errorMessage: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log(`Found ${stuck.length} stuck video(s)\n`);

  if (stuck.length === 0) {
    console.log("✅ No stuck videos found!");
    await prisma.$disconnect();
    return;
  }

  // Reset to NONE status first
  console.log("🔄 Resetting videos to NONE status...");
  await prisma.videoIndex.updateMany({
    where: {
      videoId: { in: stuck.map((v) => v.videoId) },
    },
    data: {
      status: IndexStatus.NONE,
      errorMessage: null,
    },
  });

  console.log("✅ Reset complete\n");
  console.log("🚀 Re-indexing videos...\n");

  // Re-index each video
  for (const video of stuck) {
    console.log(`\n📹 Processing: ${video.videoId}`);
    console.log(`   Title: ${video.title || "(No title)"}`);

    try {
      const result = await indexVideo({ videoId: video.videoId });
      console.log(`   ✅ Status: ${result.status}`);
    } catch (error) {
      console.error(`   ❌ Error:`, error instanceof Error ? error.message : error);
    }
  }

  console.log("\n✅ All videos processed!");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
