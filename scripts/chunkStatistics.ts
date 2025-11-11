import { prisma } from "../lib/db";
import { IndexStatus } from "@prisma/client";

async function main() {
  console.log("📊 Chunk Statistics for all videos\n");

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

  const stats: { chunks: number; count: number }[] = [];
  const distribution: Record<number, number> = {};

  for (const video of allVideos) {
    if (!video.chunksJSON) continue;

    try {
      const chunks = JSON.parse(video.chunksJSON) as string[];
      const chunkCount = chunks.length;

      distribution[chunkCount] = (distribution[chunkCount] || 0) + 1;
    } catch (e) {
      // ignore
    }
  }

  console.log("Distribution of chunk counts:\n");

  const sorted = Object.entries(distribution).sort(([a], [b]) => Number(a) - Number(b));

  for (const [chunkCount, videoCount] of sorted) {
    const bar = "█".repeat(Math.min(videoCount, 50));
    console.log(`  ${chunkCount.padStart(2)} chunks: ${bar} (${videoCount} videos)`);
  }

  console.log();

  const totalVideos = allVideos.length;
  const oneChunk = distribution[1] || 0;
  const twoToThreeChunks = (distribution[2] || 0) + (distribution[3] || 0);
  const fourToSixChunks = (distribution[4] || 0) + (distribution[5] || 0) + (distribution[6] || 0);
  const sevenPlus = totalVideos - oneChunk - twoToThreeChunks - fourToSixChunks;

  console.log("Summary:");
  console.log(`  Total videos: ${totalVideos}`);
  console.log(`  1 chunk: ${oneChunk} videos (${((oneChunk / totalVideos) * 100).toFixed(1)}%)`);
  console.log(`  2-3 chunks: ${twoToThreeChunks} videos (${((twoToThreeChunks / totalVideos) * 100).toFixed(1)}%) ← Target range`);
  console.log(`  4-6 chunks: ${fourToSixChunks} videos (${((fourToSixChunks / totalVideos) * 100).toFixed(1)}%)`);
  console.log(`  7+ chunks: ${sevenPlus} videos (${((sevenPlus / totalVideos) * 100).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main().catch(console.error);
