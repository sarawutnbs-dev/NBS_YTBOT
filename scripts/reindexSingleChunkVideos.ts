import { prisma } from "../lib/db";
import { chunkTranscript, buildIndex } from "../lib/transcript";
import { IndexStatus } from "@prisma/client";

async function main() {
  console.log("🔧 Finding videos with chunking issues...\n");

  const allVideos = await prisma.videoIndex.findMany({
    where: {
      status: IndexStatus.READY,
      chunksJSON: { not: null },
    },
    select: {
      videoId: true,
      title: true,
      chunksJSON: true,
      summaryJSON: true,
    },
  });

  const videosToFix: { videoId: string; title: string; transcript: string; oldChunks: number }[] = [];

  for (const video of allVideos) {
    if (video.chunksJSON) {
      try {
        const chunks = JSON.parse(video.chunksJSON) as string[];
        const transcript = chunks.join(" ");

        // Check if video has only 1 chunk but transcript is > 500 chars (likely needs chunking)
        if (chunks.length === 1 && transcript.length > 500) {
          videosToFix.push({
            videoId: video.videoId,
            title: video.title,
            transcript,
            oldChunks: chunks.length,
          });
        }
      } catch (e) {
        console.log(`⚠️  Failed to parse chunks for ${video.videoId}`);
      }
    }
  }

  console.log(`Found ${videosToFix.length} videos that need re-chunking:\n`);

  if (videosToFix.length === 0) {
    console.log("✅ No videos need fixing!");
    await prisma.$disconnect();
    return;
  }

  let success = 0;
  let failed = 0;

  for (const video of videosToFix) {
    console.log(`📹 Re-chunking: ${video.videoId}`);
    console.log(`   Title: ${video.title || "(No title)"}`.substring(0, 100));
    console.log(`   Transcript: ${video.transcript.length} chars`);

    try {
      // Apply new chunking
      const newChunks = chunkTranscript(video.transcript, 400);
      const { summaryJSON } = await buildIndex(newChunks);

      // Update database
      await prisma.videoIndex.update({
        where: { videoId: video.videoId },
        data: {
          chunksJSON: JSON.stringify(newChunks),
          summaryJSON: JSON.stringify(summaryJSON),
        },
      });

      console.log(`   ✅ Updated: ${video.oldChunks} chunk → ${newChunks.length} chunks\n`);
      success++;

      // Small delay to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`   ❌ Error:`, error instanceof Error ? error.message : error);
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
