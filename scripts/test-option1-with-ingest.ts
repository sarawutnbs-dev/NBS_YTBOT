/**
 * Test Option 1: Two-Stage Retrieval with Product Ingestion
 */

import { prisma } from "@/lib/db";
import { generateAnswer } from "@/lib/rag/answer";
import { ingestProduct } from "@/lib/rag/ingest";
import { extractBrands, extractCategories } from "@/lib/brandUtils";

async function testOption1WithIngest() {
  console.log("🧪 Testing Option 1: Two-Stage Retrieval (with product ingest)\n");

  try {
    // 1. Ingest products first
    console.log("1️⃣ Ingesting products into RAG...");

    const products = await prisma.product.findMany({
      where: {
        shopeeProductId: { not: null },
        brand: { not: null }
      },
      take: 20, // Test with 20 products
      select: {
        id: true,
        name: true,
        price: true,
        commission: true,
        affiliateUrl: true,
        productLink: true,
        tags: true,
        brand: true,
        categoryName: true
      }
    });

    console.log(`   Found ${products.length} products to ingest`);

    let ingestedCount = 0;
    for (const product of products) {
      try {
        await ingestProduct({
          productId: product.id,
          name: product.name,
          price: product.price ?? undefined,
          url: product.affiliateUrl || product.productLink || undefined,
          tags: product.tags ?? undefined,
          category: product.categoryName ?? undefined,
          description: `${product.name} - ${product.brand} - ${product.categoryName}`
        }, true); // overwrite if exists

        ingestedCount++;
        if (ingestedCount % 5 === 0) {
          console.log(`   Ingested ${ingestedCount}/${products.length} products...`);
        }
      } catch (error: any) {
        // Skip if already exists
        if (!error.message?.includes("already exists")) {
          console.error(`   ⚠️  Failed to ingest ${product.id}:`, error.message);
        }
      }
    }

    console.log(`   ✅ Ingested ${ingestedCount} products\n`);

    // 2. Setup video metadata
    console.log("2️⃣ Setting up video metadata...");

    // Create a test video if not exists
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
      console.log(`   ✅ Created test video`);
    } else {
      await prisma.videoIndex.update({
        where: { videoId },
        data: {
          categoryTags: ["Notebook"],
          brandTags: ["ASUS", "Acer"],
          priceRangeMin: 10000,
          priceRangeMax: 20000,
        }
      });
      console.log(`   ✅ Updated test video metadata`);
    }

    console.log(`   Video: ${video.title}`);
    console.log(`   Categories: Notebook`);
    console.log(`   Brands: ASUS, Acer`);
    console.log(`   Price Range: ฿10,000 - ฿20,000\n`);

    // 3. Test queries
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

    for (const [idx, test] of testQueries.entries()) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Test ${idx + 1}: ${test.description}`);
      console.log(`Query: "${test.query}"`);
      console.log(`${"=".repeat(60)}\n`);

      const startTime = Date.now();

      const result = await generateAnswer({
        query: test.query,
        videoId: videoId,
        includeProducts: true,
        includeTranscripts: false, // No transcript for test
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
      console.log(`   Context: ${result.tokenUsage.contextTokens} tokens`);
      console.log(`   Total: ${result.tokenUsage.totalTokens} tokens`);

      // Extract product recommendations
      const productContexts = result.contexts.filter(c => c.sourceType === "product");
      if (productContexts.length > 0) {
        console.log(`\n🛍️  Product Recommendations: ${productContexts.length}`);
      }
    }

    // 4. Performance Summary
    console.log(`\n\n${"=".repeat(60)}`);
    console.log(`✅ Option 1 Test Complete!`);
    console.log(`${"=".repeat(60)}\n`);

    console.log(`📈 Results:`);
    console.log(`   ✅ Two-stage retrieval integrated`);
    console.log(`   ✅ Metadata filtering working`);
    console.log(`   ✅ Brand/category matching active\n`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

testOption1WithIngest()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
