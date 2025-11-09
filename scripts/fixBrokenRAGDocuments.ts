import { prisma } from "../lib/db";
import { ingestTranscript } from "../lib/rag/ingest";
import { IndexStatus } from "@prisma/client";

async function main() {
  console.log("🔧 Finding RAG documents without chunks...\n");

  // Find documents without chunks
  const brokenDocs = await prisma.ragDocument.findMany({
    where: {
      sourceType: "transcript",
      chunks: {
        none: {},
      },
    },
    select: {
      id: true,
      sourceId: true,
    },
  });

  console.log(`Found ${brokenDocs.length} documents without chunks\n`);

  if (brokenDocs.length === 0) {
    console.log("✅ No broken documents found!");
    await prisma.$disconnect();
    return;
  }

  // Delete broken documents
  console.log("🗑️  Deleting broken documents...");
  await prisma.ragDocument.deleteMany({
    where: {
      id: {
        in: brokenDocs.map((d) => d.id),
      },
    },
  });
  console.log("✅ Deleted broken documents\n");

  // Get videos that are READY and should be re-ingested
  const videoIds = brokenDocs.map((d) => d.sourceId);
  const readyVideos = await prisma.videoIndex.findMany({
    where: {
      videoId: {
        in: videoIds,
      },
      status: IndexStatus.READY,
    },
    select: {
      videoId: true,
      title: true,
      publishedAt: true,
    },
  });

  console.log(`Found ${readyVideos.length} READY videos to re-ingest:\n`);

  if (readyVideos.length === 0) {
    console.log("⚠️  No READY videos to re-ingest");
    console.log("   (The broken documents may be from videos that are not READY yet)");
    await prisma.$disconnect();
    return;
  }

  // Re-ingest each video
  let success = 0;
  let failed = 0;

  for (const video of readyVideos) {
    console.log(`\n📹 Re-ingesting: ${video.videoId}`);
    console.log(`   Title: ${video.title || "(No title)"}`);

    try {
      // Get transcript from VideoIndex
      const videoIndex = await prisma.videoIndex.findUnique({
        where: { videoId: video.videoId },
        select: {
          chunksJSON: true,
        },
      });

      if (!videoIndex?.chunksJSON) {
        console.log(`   ⚠️  No chunksJSON found, skipping`);
        failed++;
        continue;
      }

      const chunks = JSON.parse(videoIndex.chunksJSON) as string[];
      const transcript = chunks.join(" ");

      // Re-ingest to RAG
      const result = await ingestTranscript(
        {
          videoId: video.videoId,
          title: video.title || "Untitled",
          channelName: "Unknown",
          transcript,
          publishedAt: video.publishedAt?.toISOString(),
          duration: undefined,
          viewCount: undefined,
        },
        true // overwrite
      );

      console.log(`   ✅ Created ${result.chunksCreated} chunks`);
      success++;

      // Small delay to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 500));
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
