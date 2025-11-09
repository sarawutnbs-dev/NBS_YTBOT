import { prisma } from "../lib/db";
import { chunkTranscript, buildIndex } from "../lib/transcript";
import { IndexStatus } from "@prisma/client";

async function main() {
  console.log("🔧 Re-chunking all videos with new chunk size (6000 chars)...\n");

  const allVideos = await prisma.videoIndex.findMany({
    where: {
      status: IndexStatus.READY,
      chunksJSON: { not: null },
    },
    select: {
      videoId: true,
      title: true,
      chunksJSON: true,
    },
  });

  console.log(`Found ${allVideos.length} videos to re-chunk\n`);

  if (allVideos.length === 0) {
    console.log("✅ No videos to re-chunk!");
    await prisma.$disconnect();
    return;
  }

  let success = 0;
  let failed = 0;

  for (const video of allVideos) {
    if (!video.chunksJSON) continue;

    try {
      // Get transcript from existing chunks
      const oldChunks = JSON.parse(video.chunksJSON) as string[];
      const transcript = oldChunks.join(" ");

      // Apply new chunking (6000 chars)
      const newChunks = chunkTranscript(transcript);
      const { summaryJSON } = await buildIndex(newChunks);

      // Update database
      await prisma.videoIndex.update({
        where: { videoId: video.videoId },
        data: {
          chunksJSON: JSON.stringify(newChunks),
          summaryJSON: JSON.stringify(summaryJSON),
        },
      });

      console.log(`✅ ${video.videoId}: ${oldChunks.length} → ${newChunks.length} chunks`);
      success++;

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`❌ ${video.videoId}:`, error instanceof Error ? error.message : error);
      failed++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Success: ${success}`);
  console.log(`   ❌ Failed: ${failed}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
