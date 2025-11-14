/**
 * Test price re-ranking functionality
 */

import { createEmbedding } from "../lib/rag/openai";
import { hybridSearch } from "../lib/rag/retriever";
import { extractPriceFromQuery, rerankByPrice, debugPriceReranking } from "../lib/rag/price-reranking";

async function testPriceReranking() {
  console.log("=".repeat(60));
  console.log("Testing Price Re-ranking");
  console.log("=".repeat(60));

  try {
    // Test queries with different price patterns
    const testQueries = [
      "ต้องการ Notebook gaming 40K",
      "อยากได้โน๊ตบุ๊คงบ 25000 บาท",
      "หา notebook ราคาไม่เกิน 50,000",
      "แนะนำ gaming laptop" // No price
    ];

    for (const query of testQueries) {
      console.log("\n" + "=".repeat(60));
      console.log(`Query: "${query}"`);
      console.log("=".repeat(60));

      // 1. Extract price
      const queryPrice = extractPriceFromQuery(query);
      console.log(`\n[1] Price Detection:`);
      if (queryPrice) {
        console.log(`   ✅ Detected: ${queryPrice.toLocaleString()} บาท`);
      } else {
        console.log(`   ℹ️  No price detected`);
      }

      // 2. Create embedding
      console.log(`\n[2] Creating embedding...`);
      const startEmbed = Date.now();
      const queryEmbedding = await createEmbedding(query);
      const embedTime = Date.now() - startEmbed;
      console.log(`   ✅ Done in ${embedTime}ms`);

      // 3. Search products (get more for better re-ranking)
      console.log(`\n[3] Searching products...`);
      const startSearch = Date.now();
      const productResults = await hybridSearch(query, {
        topK: 50,  // Get 50 results
        sourceType: "product",
        minScore: 0.3,
        queryEmbedding,
      });
      const searchTime = Date.now() - startSearch;
      console.log(`   ✅ Found ${productResults.length} results in ${searchTime}ms`);

      if (productResults.length === 0) {
        console.log(`   ⚠️  No products found, skipping this query`);
        continue;
      }

      // 4. Show top 5 BEFORE re-ranking
      console.log(`\n[4] Top 5 BEFORE Re-ranking (Semantic only):`);
      productResults.slice(0, 5).forEach((r, i) => {
        const meta = r.meta as any;
        console.log(`   ${i + 1}. ${(r.score * 100).toFixed(1)}% - ${meta.name?.substring(0, 50) || 'Unknown'}...`);
        console.log(`      Price: ${meta.price ? meta.price.toLocaleString() + ' ฿' : 'N/A'}`);
      });

      // 5. Re-rank by price (if price detected)
      if (queryPrice) {
        console.log(`\n[5] Re-ranking by price...`);
        const startRerank = Date.now();
        const rerankedResults = rerankByPrice(productResults, queryPrice, {
          priceWeight: 0.4,
          semanticWeight: 0.6
        });
        const rerankTime = Date.now() - startRerank;
        console.log(`   ✅ Done in ${rerankTime}ms`);

        // 6. Show top 5 AFTER re-ranking
        console.log(`\n[6] Top 5 AFTER Re-ranking (Semantic + Price):`);
        rerankedResults.slice(0, 5).forEach((r, i) => {
          const meta = r.meta as any;
          console.log(`   ${i + 1}. ${(r.score * 100).toFixed(1)}% - ${meta.name?.substring(0, 50) || 'Unknown'}...`);
          console.log(`      Price: ${meta.price ? meta.price.toLocaleString() + ' ฿' : 'N/A'}`);
          if (meta._priceScore !== undefined) {
            console.log(`      Semantic: ${(meta._semanticScore * 100).toFixed(1)}% | Price: ${(meta._priceScore * 100).toFixed(1)}%`);
          }
        });

        // 7. Comparison
        console.log(`\n[7] Impact Analysis:`);
        const topBefore = productResults[0];
        const topAfter = rerankedResults[0];
        const metaBefore = topBefore.meta as any;
        const metaAfter = topAfter.meta as any;

        if (metaBefore.name === metaAfter.name) {
          console.log(`   ℹ️  Top result unchanged`);
        } else {
          console.log(`   ✅ Top result changed!`);
          console.log(`      Before: ${metaBefore.name?.substring(0, 40)}...`);
          console.log(`      After: ${metaAfter.name?.substring(0, 40)}...`);
        }

        // Calculate avg price difference
        const avgPriceDiffBefore = productResults.slice(0, 5).reduce((sum, r) => {
          const meta = r.meta as any;
          if (!meta.price) return sum;
          return sum + Math.abs(queryPrice - meta.price) / queryPrice;
        }, 0) / 5;

        const avgPriceDiffAfter = rerankedResults.slice(0, 5).reduce((sum, r) => {
          const meta = r.meta as any;
          if (!meta.price) return sum;
          return sum + Math.abs(queryPrice - meta.price) / queryPrice;
        }, 0) / 5;

        console.log(`   Avg price difference (top 5):`);
        console.log(`      Before: ${(avgPriceDiffBefore * 100).toFixed(1)}%`);
        console.log(`      After: ${(avgPriceDiffAfter * 100).toFixed(1)}%`);
        if (avgPriceDiffAfter < avgPriceDiffBefore) {
          console.log(`      ✅ Improved by ${((avgPriceDiffBefore - avgPriceDiffAfter) * 100).toFixed(1)}%`);
        }
      } else {
        console.log(`\n[5] Skipping re-ranking (no price detected)`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ All tests completed!");
    console.log("=".repeat(60));

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPriceReranking();
