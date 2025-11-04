/**
 * Test Option 1: Two-Stage Retrieval Integration
 */

import { prisma } from "@/lib/db";
import { generateAnswer } from "@/lib/rag/answer";
import { extractBrands, extractCategories } from "@/lib/brandUtils";

async function testOption1() {
  console.log("🧪 Testing Option 1: Two-Stage Retrieval\n");

  try {
    // 1. Setup: Update video metadata for testing
    console.log("1️⃣ Setting up video metadata...");

    const video = await prisma.videoIndex.findFirst({
      where: { status: "READY" },
      select: {
        videoId: true,
        title: true,
        tags: true,
        categoryTags: true,
        brandTags: true
      }
    });

    if (!video) {
      console.log("   ❌ No ready videos found. Please index a video first.");
      return;
    }

    console.log(`   ✅ Found video: ${video.title}`);
    console.log(`   Video ID: ${video.videoId}`);
    console.log(`   Tags: ${video.tags.join(', ')}`);

    // Extract metadata from tags
    const categories = extractCategories(video.tags);
    const brands = extractBrands(video.tags, video.title);

    console.log(`   Extracted categories: ${categories.join(', ') || 'None'}`);
    console.log(`   Extracted brands: ${brands.join(', ') || 'None'}`);

    // Update video metadata
    await prisma.videoIndex.update({
      where: { videoId: video.videoId },
      data: {
        categoryTags: categories,
        brandTags: brands,
        priceRangeMin: 10000, // Example price range
        priceRangeMax: 30000
      }
    });

    console.log(`   ✅ Updated video metadata\n`);

    // 2. Test queries
    const testQueries = [
      {
        query: "แนะนำ notebook ราคา 15000 หน่อยครับ",
        description: "Product recommendation with price"
      },
      {
        query: "ASUS กับ Acer แบบไหนดีกว่ากัน",
        description: "Brand comparison"
      },
      {
        query: "สเปคแรมเท่าไหร่ดีครับ",
        description: "Technical spec question"
      }
    ];

    for (const [idx, test] of testQueries.entries()) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Test ${idx + 1}: ${test.description}`);
      console.log(`Query: "${test.query}"`);
      console.log(`${"=".repeat(60)}\n`);

      const startTime = Date.now();

      const result = await generateAnswer({
        query: test.query,
        videoId: video.videoId,
        includeProducts: true,
        includeTranscripts: true,
        includeComments: false,
        temperature: 0.7
      });

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      console.log(`⏱️  Time: ${elapsed}ms\n`);

      console.log(`📊 Contexts Retrieved: ${result.contexts.length}`);
      result.contexts.forEach((ctx, i) => {
        console.log(`   ${i + 1}. [${ctx.sourceType}] Score: ${ctx.score.toFixed(3)}`);
        console.log(`      ${ctx.text.substring(0, 100)}...`);
      });

      console.log(`\n💬 Answer:`);
      console.log(`   ${result.answer}\n`);

      console.log(`🔢 Token Usage:`);
      console.log(`   Query: ${result.tokenUsage.queryTokens}`);
      console.log(`   Context: ${result.tokenUsage.contextTokens}`);
      console.log(`   Total: ${result.tokenUsage.totalTokens}`);

      // Extract product recommendations
      const productContexts = result.contexts.filter(c => c.sourceType === "product");
      if (productContexts.length > 0) {
        console.log(`\n🛍️  Product Recommendations: ${productContexts.length}`);
      }
    }

    // 3. Performance Summary
    console.log(`\n\n${"=".repeat(60)}`);
    console.log(`✅ Option 1 Test Complete!`);
    console.log(`${"=".repeat(60)}\n`);

    console.log(`📈 Expected Improvements:`);
    console.log(`   - Faster product search (metadata filtering first)`);
    console.log(`   - More relevant results (brand/category matching)`);
    console.log(`   - Better price range filtering\n`);

    console.log(`📝 Next Steps:`);
    console.log(`   - Compare response times with old method`);
    console.log(`   - Check if brands are being filtered correctly`);
    console.log(`   - Verify price range filtering works`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

testOption1()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
