/**
 * Check video summary status in DB
 *
 * Run: npx tsx scripts/check-video-summary.ts A_rJAFy1D-0
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const videoId = process.argv[2];

  if (!videoId) {
    console.error("Usage: npx tsx scripts/check-video-summary.ts <videoId>");
    process.exit(1);
  }

  console.log(`=== Checking Video Summary ===`);
  console.log(`Video ID: ${videoId}\n`);

  const videoIndex = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      id: true,
      videoId: true,
      title: true,
      status: true,
      source: true,
      errorMessage: true,
      chunksJSON: true,
      summaryJSON: true,
      summaryText: true,
      summaryCategory: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  if (!videoIndex) {
    console.log("❌ Video not found in database");
    process.exit(1);
  }

  console.log("📊 Video Index Record:");
  console.log(`  - ID: ${videoIndex.id}`);
  console.log(`  - Title: ${videoIndex.title}`);
  console.log(`  - Status: ${videoIndex.status}`);
  console.log(`  - Source: ${videoIndex.source || "N/A"}`);
  console.log(`  - Created: ${videoIndex.createdAt}`);
  console.log(`  - Updated: ${videoIndex.updatedAt}`);

  if (videoIndex.errorMessage) {
    console.log(`  - Error: ${videoIndex.errorMessage}`);
  }

  console.log("\n📝 Transcript Data:");

  // Check chunksJSON
  if (videoIndex.chunksJSON) {
    try {
      const chunks = JSON.parse(videoIndex.chunksJSON);
      const fullTranscript = chunks.join("\n\n");
      console.log(`  ✅ chunksJSON: ${chunks.length} chunks`);
      console.log(`  ✅ Full Transcript: ${fullTranscript.length} chars`);
      console.log(`  ✅ Preview: ${fullTranscript.substring(0, 200)}...`);
    } catch (e) {
      console.log(`  ❌ chunksJSON: Failed to parse (${e})`);
    }
  } else {
    console.log(`  ❌ chunksJSON: NOT FOUND`);
  }

  // Check summaryJSON
  if (videoIndex.summaryJSON) {
    try {
      const summary = JSON.parse(videoIndex.summaryJSON);
      console.log(`  ✅ summaryJSON: ${JSON.stringify(summary).length} chars`);
      console.log(`  ✅ Keywords: ${summary.keywords?.join(", ") || "N/A"}`);
    } catch (e) {
      console.log(`  ❌ summaryJSON: Failed to parse`);
    }
  } else {
    console.log(`  ⚠️  summaryJSON: NOT FOUND`);
  }

  console.log("\n🤖 GPT-5 AI Summary:");

  // Check summaryText (GPT-5)
  if (videoIndex.summaryText) {
    const wordCount = videoIndex.summaryText.split(/\s+/).length;
    console.log(`  ✅ summaryText: ${videoIndex.summaryText.length} chars`);
    console.log(`  ✅ Word Count: ${wordCount} words`);
    console.log(`  ✅ Category: ${videoIndex.summaryCategory || "Unknown"}`);
    console.log(`  ✅ Preview:`);
    console.log(`\n---`);
    console.log(videoIndex.summaryText.substring(0, 500));
    if (videoIndex.summaryText.length > 500) {
      console.log(`\n... (${videoIndex.summaryText.length - 500} more chars)`);
    }
    console.log(`---\n`);
  } else {
    console.log(`  ❌ summaryText: NOT FOUND (GPT-5 summarization may have failed)`);
    console.log(`  ❌ summaryCategory: ${videoIndex.summaryCategory || "NOT FOUND"}`);
  }

  // Check RAG ingestion
  console.log("🔍 RAG Ingestion Status:");

  const ragDoc = await prisma.ragDocument.findFirst({
    where: {
      sourceType: "transcript",
      sourceId: videoId,
    },
    include: {
      _count: {
        select: { chunks: true },
      },
    },
  });

  if (ragDoc) {
    console.log(`  ✅ RagDocument found (ID: ${ragDoc.id})`);
    console.log(`  ✅ Chunks count: ${ragDoc._count.chunks}`);

    const firstChunk = await prisma.ragChunk.findFirst({
      where: { docId: ragDoc.id },
      select: { text: true, chunkIndex: true },
    });

    if (firstChunk) {
      console.log(`  ✅ First chunk preview: ${firstChunk.text.substring(0, 200)}...`);
    }
  } else {
    console.log(`  ❌ RagDocument NOT FOUND (RAG ingestion may have failed)`);
  }

  console.log("\n✅ Check completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
