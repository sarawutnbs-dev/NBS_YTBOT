import { prisma } from "../lib/db";

async function main() {
  const videoId = "AhZ58eUmbcw";

  console.log(`🔍 Checking data for video: ${videoId}\n`);

  // Get VideoIndex data
  const videoIndex = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      videoId: true,
      title: true,
      status: true,
      source: true,
      chunksJSON: true,
      summaryJSON: true,
    },
  });

  if (!videoIndex) {
    console.log("❌ Video not found in database");
    await prisma.$disconnect();
    return;
  }

  console.log("📹 VideoIndex Data:");
  console.log("  Status:", videoIndex.status);
  console.log("  Source:", videoIndex.source);
  console.log("  Title:", videoIndex.title);

  // Parse and display chunks
  if (videoIndex.chunksJSON) {
    try {
      const chunks = JSON.parse(videoIndex.chunksJSON) as string[];
      console.log(`\n📦 VideoIndex Chunks: ${chunks.length} chunks`);
      chunks.forEach((chunk, idx) => {
        console.log(`  Chunk ${idx + 1}: ${chunk.substring(0, 100)}...`);
      });
    } catch (e) {
      console.log("  ❌ Failed to parse chunksJSON:", e);
    }
  } else {
    console.log("\n📦 VideoIndex Chunks: (null)");
  }

  // Parse and display summary
  if (videoIndex.summaryJSON) {
    try {
      const summary = JSON.parse(videoIndex.summaryJSON);
      console.log(`\n📊 Summary:`, JSON.stringify(summary, null, 2));
    } catch (e) {
      console.log("  ❌ Failed to parse summaryJSON:", e);
    }
  } else {
    console.log("\n📊 Summary: (null)");
  }

  // Check RAG chunks
  const ragDoc = await prisma.ragDocument.findFirst({
    where: {
      sourceType: "transcript",
      sourceId: videoId,
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
    console.log(`\n🤖 RAG Document:`);
    console.log(`  Document ID: ${ragDoc.id}`);
    console.log(`  RAG Chunks: ${ragDoc._count.chunks} chunks`);
  } else {
    console.log(`\n🤖 RAG Document: Not found`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
