import { prisma } from "../lib/db";

async function main() {
  console.log("🔍 Looking for videos with only 1 chunk in VideoIndex...\n");

  const allVideos = await prisma.videoIndex.findMany({
    where: {
      status: "READY",
      chunksJSON: { not: null },
    },
    select: {
      videoId: true,
      title: true,
      chunksJSON: true,
      summaryJSON: true,
      source: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 20,
  });

  console.log(`Found ${allVideos.length} READY videos with chunks\n`);

  const singleChunkVideos: any[] = [];
  const multiChunkVideos: any[] = [];

  for (const video of allVideos) {
    if (video.chunksJSON) {
      try {
        const chunks = JSON.parse(video.chunksJSON) as string[];
        const summary = video.summaryJSON ? JSON.parse(video.summaryJSON) : null;

        const videoData = {
          videoId: video.videoId,
          title: video.title,
          source: video.source,
          chunks: chunks.length,
          summaryTotalChunks: summary?.totalChunks || 0,
        };

        if (chunks.length === 1) {
          singleChunkVideos.push(videoData);
        } else {
          multiChunkVideos.push(videoData);
        }
      } catch (e) {
        console.log(`⚠️  Failed to parse chunks for ${video.videoId}`);
      }
    }
  }

  if (singleChunkVideos.length > 0) {
    console.log(`\n🔴 Videos with ONLY 1 chunk (${singleChunkVideos.length}):`);
    singleChunkVideos.forEach((v) => {
      console.log(`  📹 ${v.videoId}`);
      console.log(`     Title: ${v.title || "(No title)"}`);
      console.log(`     Source: ${v.source}`);
      console.log(`     Chunks: ${v.chunks}, Summary says: ${v.summaryTotalChunks}`);
      console.log();
    });
  } else {
    console.log("\n✅ No videos with only 1 chunk found!");
  }

  console.log(`\n🟢 Videos with multiple chunks (${multiChunkVideos.length}):`);
  multiChunkVideos.slice(0, 5).forEach((v) => {
    console.log(`  📹 ${v.videoId} - ${v.chunks} chunks (${v.source})`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
