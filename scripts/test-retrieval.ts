/**
 * Test script to verify retrieval system is working
 * Run: npx tsx scripts/test-retrieval.ts
 */

import { PrismaClient } from "@prisma/client";
import { smartSearchV3 } from "@/lib/rag/retriever-v3";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Testing Retrieval System ===\n");

  try {
    // Get a sample video with transcript
    const videoWithTranscript = await prisma.ragDocument.findFirst({
      where: {
        sourceType: "transcript",
      },
      select: {
        sourceId: true,
        meta: true,
      },
    });

    if (!videoWithTranscript) {
      console.log("❌ No transcript found in database");
      return;
    }

    const videoId = videoWithTranscript.sourceId;
    const videoTitle = (videoWithTranscript.meta as any)?.title || "Unknown";

    console.log(`📹 Test Video: ${videoTitle}`);
    console.log(`   Video ID: ${videoId}\n`);

    // Test queries
    const testQueries = [
      "ทุกรุ่นในนี้ รุ่นไหนเล่นเกมได้แรงสุดครับ",
      "โน๊ตบุ๊คราคาไม่เกิน 30000 มีรุ่นไหนแนะนำบ้าง",
      "ต้องการโน๊ตบุ๊คสเปคดี ใช้งานหน่วย",
    ];

    for (const [index, query] of testQueries.entries()) {
      console.log(`\n--- Query ${index + 1}/${testQueries.length} ---`);
      console.log(`Query: "${query}"\n`);

      // Test with different minScore values
      const minScores = [0.6, 0.3, 0.2];

      for (const minScore of minScores) {
        console.log(`Testing with minScore: ${minScore}`);

        const results = await smartSearchV3(query, videoId, {
          topK: 6,
          includeTranscripts: true,
          includeProducts: true,
          minScore,
        });

        console.log(`  Results: ${results.length}`);

        if (results.length > 0) {
          const transcriptResults = results.filter(r => r.sourceType === "transcript");
          const productResults = results.filter(r => r.sourceType === "product");

          console.log(`  - Transcripts: ${transcriptResults.length}`);
          console.log(`  - Products: ${productResults.length}`);

          // Show top 3 scores
          const topScores = results
            .slice(0, 3)
            .map((r, i) => `${i + 1}. ${r.sourceType} (${r.score.toFixed(3)})`)
            .join(", ");
          console.log(`  - Top scores: ${topScores}`);
        } else {
          console.log(`  ⚠️  No results found!`);
        }
      }

      // Wait a bit between queries
      if (index < testQueries.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log("\n=== Test Complete ===");
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log("\n✅ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
