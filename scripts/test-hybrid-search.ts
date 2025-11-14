/**
 * Test script for Hybrid Search in Comment Reply
 *
 * This script tests the new hybrid search implementation that replaces
 * AI Summary + VideoProductPool with embedding-based semantic search.
 */

import { PrismaClient } from "@prisma/client";
import { generateCommentReply } from "../lib/rag/comment-reply";

const prisma = new PrismaClient();

async function testHybridSearch() {
  console.log("=".repeat(80));
  console.log("Testing Hybrid Search for Comment Reply");
  console.log("=".repeat(80));

  try {
    // 1. Find a video with VideoProductPool data
    console.log("\n[1] Finding video with VideoProductPool data...");

    const videoWithPool = await prisma.videoProductPool.findFirst({
      select: {
        videoId: true,
        relevanceScore: true,
      },
      orderBy: {
        relevanceScore: 'desc'
      }
    });

    if (!videoWithPool) {
      console.error("❌ No VideoProductPool data found. Please run pool computation first.");
      process.exit(1);
    }

    const videoId = videoWithPool.videoId;
    console.log(`✅ Found video: ${videoId}`);

    // Get video details
    const videoIndex = await prisma.videoIndex.findUnique({
      where: { videoId },
      select: {
        title: true,
        categoryTags: true,
        brandTags: true,
        priceRangeMin: true,
        priceRangeMax: true,
      }
    });

    console.log(`   Title: ${videoIndex?.title || 'N/A'}`);
    console.log(`   Categories: ${videoIndex?.categoryTags.join(', ') || 'N/A'}`);
    console.log(`   Brands: ${videoIndex?.brandTags.join(', ') || 'N/A'}`);
    console.log(`   Price Range: ${videoIndex?.priceRangeMin || 'N/A'} - ${videoIndex?.priceRangeMax || 'N/A'}`);

    // 2. Test with different types of comments
    const testComments = [
      {
        name: "Purchase Intent - Budget Query",
        text: "อยากได้ notebook ราคา 20,000 บาท แนะนำหน่อยครับ"
      },
      {
        name: "Technical Question",
        text: "RAM 8GB พอไหมครับสำหรับทำงาน Excel และเปิดเบราว์เซอร์หลายแท็บ"
      },
      {
        name: "Comparison Question",
        text: "เปรียบเทียบ Intel i5 กับ AMD Ryzen 5 อันไหนดีกว่ากันครับ"
      }
    ];

    // 3. Run tests for each comment
    for (let i = 0; i < testComments.length; i++) {
      const testCase = testComments[i];

      console.log("\n" + "=".repeat(80));
      console.log(`[${i + 2}] Test Case: ${testCase.name}`);
      console.log("=".repeat(80));
      console.log(`Comment: "${testCase.text}"`);
      console.log("");

      const startTime = Date.now();

      try {
        const response = await generateCommentReply({
          commentText: testCase.text,
          videoId: videoId,
          includeProducts: true,
          includeTranscripts: true,
          maxTokens: 3000,
          model: "gpt-4o-mini" // Use faster model for testing
        });

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        console.log("✅ Reply generated successfully!\n");
        console.log("-".repeat(80));
        console.log("REPLY:");
        console.log("-".repeat(80));
        console.log(response.replyText);
        console.log("");
        console.log("-".repeat(80));
        console.log("PRODUCTS RECOMMENDED:");
        console.log("-".repeat(80));

        if (response.products.length > 0) {
          response.products.forEach((product, idx) => {
            console.log(`${idx + 1}. Product ID: ${product.id}`);
            console.log(`   URL: ${product.url}`);
            console.log(`   Reason: ${product.reason}`);
            console.log(`   Confidence: ${product.confidence}`);
            console.log("");
          });
        } else {
          console.log("(No products recommended)");
        }

        console.log("-".repeat(80));
        console.log("METRICS:");
        console.log("-".repeat(80));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`🤖 Model: ${response.model}`);
        console.log(`📊 Token Usage:`);
        console.log(`   - Query: ${response.tokenUsage.queryTokens} tokens`);
        console.log(`   - System: ${response.tokenUsage.systemTokens} tokens`);
        console.log(`   - Context: ${response.tokenUsage.contextTokens} tokens`);
        console.log(`   - Total: ${response.tokenUsage.totalTokens} tokens`);
        console.log(`📦 Contexts Found: ${response.contexts.length} chunks`);

      } catch (error: any) {
        console.error(`❌ Error generating reply: ${error.message}`);
        console.error(error.stack);
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ All tests completed!");
    console.log("=".repeat(80));

  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
testHybridSearch().catch(console.error);
