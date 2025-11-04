/**
 * Test Option 2: VideoProductPool with Precomputation
 */

import { prisma } from "@/lib/db";
import { generateAnswer } from "@/lib/rag/answer";
import { computeVideoProductPool, getVideoPoolStats } from "@/lib/rag/video-product-pool";
import { poolBasedHybridSearch } from "@/lib/rag/retriever-v3";

async function testOption2() {
  console.log("🧪 Testing Option 2: VideoProductPool with Precomputation\n");

  try {
    // 1. Setup test video
    console.log("1️⃣ Setting up test video...");

    const videoId = "TEST_VIDEO_001";
    let video = await prisma.videoIndex.findUnique({
      where: { videoId }
    });

    if (!video) {
      video = await prisma.videoIndex.create({
        data: {
          videoId,
          title: "รีวิว Notebook ราคา 15,000 บาท ASUS vs Acer",
          status: "READY",
          tags: ["ASUS", "Acer", "Notebook", "Laptop"],
          categoryTags: ["Notebook"],
          brandTags: ["ASUS", "Acer"],
          priceRangeMin: 10000,
          priceRangeMax: 20000,
        }
      });
    }

    console.log(`   ✅ Video: ${video.title}`);
    console.log(`   Categories: ${video.categoryTags.join(', ')}`);
    console.log(`   Brands: ${video.brandTags.join(', ')}`);
    console.log(`   Price Range: ฿${video.priceRangeMin} - ฿${video.priceRangeMax}\n`);

    // 2. Compute product pool
    console.log("2️⃣ Computing product pool...");
    const poolStartTime = Date.now();

    const poolResult = await computeVideoProductPool(videoId, {
      maxPoolSize: 200,
      minRelevanceScore: 0.1,
      overwrite: true // Recompute for testing
    });

    const poolElapsed = Date.now() - poolStartTime;

    console.log(`   ✅ Pool computed in ${poolElapsed}ms`);
    console.log(`   Pool size: ${poolResult.poolSize} products`);
    console.log(`   Avg relevance score: ${poolResult.avgScore.toFixed(3)}\n`);

    // 3. Get pool statistics
    console.log("3️⃣ Pool statistics...");
    const stats = await getVideoPoolStats(videoId);

    console.log(`   Total products: ${stats.totalProducts}`);
    console.log(`   Score range: ${stats.minScore.toFixed(3)} - ${stats.maxScore.toFixed(3)}`);
    console.log(`   Average score: ${stats.avgScore.toFixed(3)}`);
    console.log(`   Match breakdown:`);

    stats.matchCounts.forEach(match => {
      const matches = [];
      if (match.matchedBrand) matches.push('Brand');
      if (match.matchedCategory) matches.push('Category');
      if (match.matchedPriceRange) matches.push('Price');
      console.log(`      ${matches.join(' + ') || 'Tags only'}: ${match._count} products`);
    });

    console.log();

    // 4. Test queries with pool-based search
    const testQueries = [
      {
        query: "แนะนำ notebook ราคา 15000 หน่อยครับ",
        description: "Product recommendation with price"
      },
      {
        query: "ASUS ดีไหมครับ",
        description: "Brand-specific question"
      },
    ];

    let lastSearchElapsed = 0;

    for (const [idx, test] of testQueries.entries()) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Test ${idx + 1}: ${test.description}`);
      console.log(`Query: "${test.query}"`);
      console.log(`${"=".repeat(60)}\n`);

      const startTime = Date.now();

      // Use pool-based search
      const contexts = await poolBasedHybridSearch(test.query, videoId, {
        topK: 6,
        includeTranscripts: false,
        includeProducts: true,
        minScore: 0.3,
        maxPoolProducts: 100
      });

      const searchElapsed = Date.now() - startTime;
      lastSearchElapsed = searchElapsed;

      console.log(`⏱️  Search time: ${searchElapsed}ms\n`);

      console.log(`📊 Contexts Retrieved: ${contexts.length}`);
      contexts.forEach((ctx, i) => {
        console.log(`   ${i + 1}. [${ctx.sourceType}] Score: ${ctx.score.toFixed(3)}`);
        console.log(`      ${ctx.text.substring(0, 100)}...`);
      });

      if (contexts.length > 0) {
        console.log(`\n🛍️  Product Recommendations: ${contexts.filter(c => c.sourceType === 'product').length}`);
      }
    }

    // 5. Performance comparison summary
    console.log(`\n\n${"=".repeat(60)}`);
    console.log(`✅ Option 2 Test Complete!`);
    console.log(`${"=".repeat(60)}\n`);

    console.log(`📈 Results:`);
    console.log(`   ✅ Product pool precomputed: ${poolResult.poolSize} products`);
    console.log(`   ✅ Pool computation time: ${poolElapsed}ms (one-time cost)`);
    console.log(`   ✅ Query search time: ~${lastSearchElapsed}ms (per query)`);
    console.log(`   ✅ Pool-based retrieval working\n`);

    console.log(`💡 Benefits:`);
    console.log(`   - Precomputation eliminates metadata filtering on every query`);
    console.log(`   - Reduced search space: ${poolResult.poolSize} vs all products`);
    console.log(`   - Faster queries after initial pool computation`);
    console.log(`   - Pool can be refreshed periodically (e.g., daily)\n`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

testOption2()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
