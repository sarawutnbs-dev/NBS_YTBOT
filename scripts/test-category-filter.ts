/**
 * Test category filtering in vectorSearch
 */

import { createEmbedding } from "@/lib/rag/openai";
import { vectorSearch, hybridSearch } from "@/lib/rag/retriever";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ override: false });

async function testCategoryFilter() {
  console.log("Testing category filter in vectorSearch\n");

  const query = "โน้ตบุ๊กเล่นเกม MSI Acer 25000-30000 บาท การ์ดจอแยก";
  console.log(`Query: "${query}"\n`);

  // Create embedding
  const embedding = await createEmbedding(query);
  console.log("✅ Created embedding\n");

  // Test 1: Search WITHOUT category filter
  console.log("Test 1: Vector search WITHOUT category filter");
  const resultsNoFilter = await vectorSearch(embedding, {
    topK: 5,
    sourceType: "product",
    minScore: 0.0
  });

  console.log(`Found ${resultsNoFilter.length} products`);
  for (const result of resultsNoFilter.slice(0, 3)) {
    console.log(`  - ${result.sourceId} (score: ${result.score.toFixed(3)}) - ${(result.meta as any)?.category || 'NO CATEGORY'}`);
  }
  console.log();

  // Test 2: Search WITH category filter = "Notebook"
  console.log("Test 2: Vector search WITH category filter = 'Notebook'");
  const resultsWithFilter = await vectorSearch(embedding, {
    topK: 5,
    sourceType: "product",
    minScore: 0.0,
    category: "Notebook"
  });

  console.log(`Found ${resultsWithFilter.length} products`);
  for (const result of resultsWithFilter.slice(0, 5)) {
    console.log(`  - ${result.sourceId} (score: ${result.score.toFixed(3)}) - ${(result.meta as any)?.category || 'NO CATEGORY'}`);
  }
  console.log();

  // Test 3: Hybrid search WITH category filter = "Notebook"
  console.log("Test 3: Hybrid search WITH category filter = 'Notebook'");
  const hybridResults = await hybridSearch(query, {
    topK: 5,
    sourceType: "product",
    minScore: 0.0,
    queryEmbedding: embedding,
    category: "Notebook"
  });

  console.log(`Found ${hybridResults.length} products`);
  for (const result of hybridResults.slice(0, 5)) {
    console.log(`  - ${result.sourceId} (score: ${result.score.toFixed(3)}) - ${(result.meta as any)?.category || 'NO CATEGORY'}`);
  }
  console.log();

  // Test 4: Search WITH category filter = "RAM"
  console.log("Test 4: Vector search WITH category filter = 'RAM'");
  const resultsRAM = await vectorSearch(embedding, {
    topK: 5,
    sourceType: "product",
    minScore: 0.0,
    category: "RAM"
  });

  console.log(`Found ${resultsRAM.length} products`);
  for (const result of resultsRAM.slice(0, 3)) {
    console.log(`  - ${result.sourceId} (score: ${result.score.toFixed(3)}) - ${(result.meta as any)?.category || 'NO CATEGORY'}`);
  }
}

testCategoryFilter().catch(console.error);
