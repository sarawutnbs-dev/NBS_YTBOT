/**
 * Test why "ต้องการโน๊ตบุ๊คเล่นเกม ราคาไม่เกิน 50,000 บาท" returns 0 results
 */

import { createEmbedding } from "@/lib/rag/openai";
import { hybridSearch } from "@/lib/rag/retriever";

async function testSearchIssue() {
  const query = "ต้องการโน๊ตบุ๊คเล่นเกม ราคาไม่เกิน 50,000 บาท";

  console.log("Testing query:", query);
  console.log("=".repeat(60));

  // Create embedding
  const embedding = await createEmbedding(query);
  console.log(`✓ Embedding created (${embedding.length} dimensions)\n`);

  // Test 1: Very low threshold
  console.log("[Test 1] minScore = 0.05 (very permissive)");
  const results1 = await hybridSearch(query, {
    topK: 20,
    sourceType: "product",
    minScore: 0.05,
    queryEmbedding: embedding
  });
  console.log(`  Found: ${results1.length} products`);
  if (results1.length > 0) {
    console.log(`  Top 3 scores: ${results1.slice(0, 3).map(r => r.score.toFixed(3)).join(", ")}`);
  }
  console.log();

  // Test 2: Low threshold
  console.log("[Test 2] minScore = 0.1");
  const results2 = await hybridSearch(query, {
    topK: 20,
    sourceType: "product",
    minScore: 0.1,
    queryEmbedding: embedding
  });
  console.log(`  Found: ${results2.length} products`);
  if (results2.length > 0) {
    console.log(`  Top 3 scores: ${results2.slice(0, 3).map(r => r.score.toFixed(3)).join(", ")}`);
  }
  console.log();

  // Test 3: Medium threshold
  console.log("[Test 3] minScore = 0.2");
  const results3 = await hybridSearch(query, {
    topK: 20,
    sourceType: "product",
    minScore: 0.2,
    queryEmbedding: embedding
  });
  console.log(`  Found: ${results3.length} products`);
  if (results3.length > 0) {
    console.log(`  Top 3 scores: ${results3.slice(0, 3).map(r => r.score.toFixed(3)).join(", ")}`);
  }
  console.log();

  // Test 4: Default threshold (current issue)
  console.log("[Test 4] minScore = 0.3 (CURRENT DEFAULT - FAILING)");
  const results4 = await hybridSearch(query, {
    topK: 20,
    sourceType: "product",
    minScore: 0.3,
    queryEmbedding: embedding
  });
  console.log(`  Found: ${results4.length} products`);
  if (results4.length > 0) {
    console.log(`  Top 3 scores: ${results4.slice(0, 3).map(r => r.score.toFixed(3)).join(", ")}`);
  }
  console.log();

  // Try simpler queries
  console.log("=".repeat(60));
  console.log("Testing simpler queries for comparison:\n");

  const queries = [
    "notebook gaming 50000",
    "โน้ตบุ๊กเกมมิ่ง 50000 บาท",
    "gaming laptop ราคาไม่เกิน 50000",
  ];

  for (const testQuery of queries) {
    console.log(`Query: "${testQuery}"`);
    const emb = await createEmbedding(testQuery);
    const res = await hybridSearch(testQuery, {
      topK: 20,
      sourceType: "product",
      minScore: 0.3,
      queryEmbedding: emb
    });
    console.log(`  Results: ${res.length} products`);
    if (res.length > 0) {
      console.log(`  Top score: ${res[0].score.toFixed(3)}`);
    }
    console.log();
  }
}

testSearchIssue()
  .then(() => {
    console.log("✅ Test complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
