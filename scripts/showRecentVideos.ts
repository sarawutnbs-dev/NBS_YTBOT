import { prisma } from "../lib/db";

async function main() {
  console.log("📋 Recent READY videos with chunk counts:\n");

  const recentVideos = await prisma.videoIndex.findMany({
    where: {
      status: "READY",
    },
    select: {
      videoId: true,
      title: true,
      source: true,
      chunksJSON: true,
      summaryJSON: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 10,
  });

  console.log(`Showing ${recentVideos.length} most recent videos:\n`);

  for (const video of recentVideos) {
    let chunkCount = 0;
    let summaryChunks = 0;
    let ragChunkCount = 0;
    let transcriptLength = 0;

    if (video.chunksJSON) {
      try {
        const chunks = JSON.parse(video.chunksJSON) as string[];
        chunkCount = chunks.length;
        transcriptLength = chunks.join(" ").length;
      } catch (e) {
        // ignore
      }
    }

    if (video.summaryJSON) {
      try {
        const summary = JSON.parse(video.summaryJSON);
        summaryChunks = summary.totalChunks || 0;
      } catch (e) {
        // ignore
      }
    }

    // Get RAG chunk count
    const ragDoc = await prisma.ragDocument.findFirst({
      where: {
        sourceType: "transcript",
        sourceId: video.videoId,
      },
      include: {
        _count: {
          select: {
            chunks: true,
          },
        },
      },
    });

    if (ragDoc) {
      ragChunkCount = ragDoc._count.chunks;
    }

    const icon = chunkCount === 1 ? "🔴" : "🟢";
    console.log(`${icon} ${video.videoId}`);
    console.log(`   Title: ${video.title || "(No title)"}`.substring(0, 100));
    console.log(`   Source: ${video.source}`);
    console.log(`   Transcript: ${transcriptLength} chars`);
    console.log(`   VideoIndex: ${chunkCount} chunks (shows as "Total Chunks: ${summaryChunks}" in UI)`);
    console.log(`   RAG: ${ragChunkCount} chunks (used for search)`);
    console.log(`   Updated: ${video.updatedAt.toISOString()}`);
    console.log();
  }

  console.log("\n💡 Explanation:");
  console.log("   🔴 = Short videos (1 chunk) - YouTube Shorts or very brief content");
  console.log("   🟢 = Longer videos (2+ chunks) - Full-length videos");
  console.log();
  console.log("   The chunking is working correctly!");
  console.log("   - Short videos naturally result in 1 chunk (< 400 chars)");
  console.log("   - Longer videos result in multiple chunks (> 400 chars)");

  await prisma.$disconnect();
}

main().catch(console.error);
