/**
 * Test similarity search directly (without API endpoint)
 */

import { PrismaClient } from "@prisma/client";
import { createEmbedding } from "../lib/rag/openai";
import { hybridSearch } from "../lib/rag/retriever";

const prisma = new PrismaClient();

async function testSimilarityDirect() {
  console.log("=".repeat(60));
  console.log("Testing Similarity Search (Direct)");
  console.log("=".repeat(60));

  try {
    const query = "ต้องการ Notebook gaming 40K";
    const videoId = "dWL68XA91qo";

    console.log(`\nQuery: "${query}"`);
    console.log(`Video ID: ${videoId}`);
    console.log("\n");

    // 1. Create embedding
    console.log("[1] Creating embedding...");
    const startEmbed = Date.now();
    const queryEmbedding = await createEmbedding(query);
    const embedTime = Date.now() - startEmbed;
    console.log(`   ✅ Embedding created in ${embedTime}ms (${queryEmbedding.length} dimensions)`);

    // 2. Search transcripts
    console.log("\n[2] Searching transcripts...");
    const startTranscript = Date.now();
    const transcriptResults = await hybridSearch(query, {
      topK: 10,
      sourceType: "transcript",
      videoId: videoId,
      minScore: 0.3,
      queryEmbedding,
    });
    const transcriptTime = Date.now() - startTranscript;
    console.log(`   ✅ Found ${transcriptResults.length} results in ${transcriptTime}ms`);

    if (transcriptResults.length > 0) {
      console.log("\n   Top 3 Transcript Results:");
      transcriptResults.slice(0, 3).forEach((r, i) => {
        console.log(`      ${i + 1}. Score: ${(r.score * 100).toFixed(1)}%`);
        console.log(`         Text: ${r.text.substring(0, 80)}...`);
      });
    }

    // 3. Search products
    console.log("\n[3] Searching products...");
    const startProduct = Date.now();
    const productResults = await hybridSearch(query, {
      topK: 20,
      sourceType: "product",
      minScore: 0.3,
      queryEmbedding,
    });
    const productTime = Date.now() - startProduct;
    console.log(`   ✅ Found ${productResults.length} results in ${productTime}ms`);

    if (productResults.length > 0) {
      console.log("\n   Top 10 Product Results:");

      // Get product details from meta (since RagDocument may contain old data)
      const productsWithScores = productResults.map(result => {
        const meta = result.meta as any;
        return {
          id: result.sourceId,
          shopeeProductId: result.sourceId,
          name: meta.name || "Unknown Product",
          price: meta.price || null,
          shortURL: meta.url || null,
          score: result.score
        };
      }).sort((a, b) => b.score - a.score).slice(0, 10);

      productsWithScores.forEach((p, i) => {
        console.log(`      ${i + 1}. Score: ${(p.score * 100).toFixed(1)}%`);
        console.log(`         Name: ${p.name.substring(0, 60)}...`);
        console.log(`         Price: ${p.price ? p.price.toLocaleString() + " ฿" : "N/A"}`);
        console.log(`         URL: ${p.shortURL || "N/A"}`);
        console.log("");
      });
    }

    console.log("=".repeat(60));
    console.log("✅ Test completed successfully!");
    console.log("=".repeat(60));
    console.log("\nSummary:");
    console.log(`   - Embedding: ${embedTime}ms`);
    console.log(`   - Transcript search: ${transcriptTime}ms (${transcriptResults.length} results)`);
    console.log(`   - Product search: ${productTime}ms (${productResults.length} results)`);

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testSimilarityDirect();
