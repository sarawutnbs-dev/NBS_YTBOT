/**
 * Test script for Fallback Search Mechanism
 *
 * Tests the fallback to global search when max similarity score < 0.7
 */

import { PrismaClient } from "@prisma/client";
import { generateCommentReply } from "../lib/rag/comment-reply";

const prisma = new PrismaClient();

async function testFallbackSearch() {
  console.log("=".repeat(80));
  console.log("Testing Fallback Search Mechanism (Score < 0.7)");
  console.log("=".repeat(80));

  try {
    // Find a video with VideoProductPool data
    console.log("\n[1] Finding video with VideoProductPool data...");

    const videoWithPool = await prisma.videoProductPool.findFirst({
      select: {
        videoId: true,
      },
    });

    if (!videoWithPool) {
      console.error("❌ No VideoProductPool data found.");
      process.exit(1);
    }

    const videoId = videoWithPool.videoId;
    console.log(`✅ Found video: ${videoId}`);

    // Test with comments that are VERY specific and unlikely to match well with pool
    // This should trigger the fallback mechanism
    const testComments = [
      {
        name: "Very Specific Query (Low Match)",
        text: "ขอเครื่อง gaming laptop RTX 4090 ราคา 150,000 บาท สำหรับทำ 3D rendering และ machine learning",
        expectedFallback: true
      },
      {
        name: "Generic Query (High Match)",
        text: "อยากได้ notebook ราคาประมาณ 20000 ครับ",
        expectedFallback: false
      },
      {
        name: "Off-Topic Query (Very Low Match)",
        text: "แนะนำร้านอาหารอร่อยๆ ใกล้ BTS อโศก",
        expectedFallback: true
      }
    ];

    for (let i = 0; i < testComments.length; i++) {
      const testCase = testComments[i];

      console.log("\n" + "=".repeat(80));
      console.log(`[${i + 2}] Test Case: ${testCase.name}`);
      console.log("=".repeat(80));
      console.log(`Comment: "${testCase.text}"`);
      console.log(`Expected Fallback: ${testCase.expectedFallback ? "YES" : "NO"}`);
      console.log("");

      const startTime = Date.now();

      try {
        const response = await generateCommentReply({
          commentText: testCase.text,
          videoId: videoId,
          includeProducts: true,
          includeTranscripts: true,
          maxTokens: 3000,
          model: "gpt-4o-mini"
        });

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        console.log("✅ Reply generated successfully!\n");
        console.log("-".repeat(80));
        console.log("REPLY:");
        console.log("-".repeat(80));
        console.log(response.replyText.substring(0, 300) + "...");
        console.log("");
        console.log("-".repeat(80));
        console.log("METRICS:");
        console.log("-".repeat(80));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`🤖 Model: ${response.model}`);
        console.log(`📦 Contexts Found: ${response.contexts.length} chunks`);
        console.log(`📊 Products Recommended: ${response.products.length}`);
        console.log(`💰 Token Usage: ${response.tokenUsage.totalTokens} tokens`);

      } catch (error: any) {
        console.error(`❌ Error generating reply: ${error.message}`);
        console.error(error.stack);
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ All tests completed!");
    console.log("=".repeat(80));
    console.log("\nLook for these log patterns to verify fallback:");
    console.log("  • 'Max similarity score: X.XXX'");
    console.log("  • 'Falling back to global search (no pool limit)' (if score < 0.7)");
    console.log("  • 'Global search completed: X chunks found'");

  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testFallbackSearch().catch(console.error);
