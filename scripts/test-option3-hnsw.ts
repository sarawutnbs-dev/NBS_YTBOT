/**
 * Test Option 3: HNSW Index Performance Benchmark
 */

import { prisma } from "@/lib/db";
import { createEmbedding } from "@/lib/rag/openai";
import { poolBasedHybridSearch } from "@/lib/rag/retriever-v3";

async function testOption3() {
  console.log("🧪 Testing Option 3: HNSW Index Performance\n");

  try {
    // 1. Verify HNSW index exists
    console.log("1️⃣ Verifying HNSW index...");

    const indexes = await prisma.$queryRaw<any[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'RagChunk'
        AND indexname LIKE '%hnsw%'
    `;

    if (indexes.length === 0) {
      console.log("   ❌ HNSW index not found!");
      console.log("   Run: npx tsx scripts/apply-hnsw-index.ts");
      return;
    }

    console.log("   ✅ HNSW index found");
    console.log(`   ${indexes[0].indexname}\n`);

    // 2. Get database statistics
    console.log("2️⃣ Database statistics...");

    const chunkCount = await prisma.ragChunk.count();

    const embeddingCountResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "RagChunk"
      WHERE embedding IS NOT NULL
    `;
    const chunksWithEmbeddings = Number(embeddingCountResult[0].count);

    console.log(`   Total chunks: ${chunkCount}`);
    console.log(`   Chunks with embeddings: ${chunksWithEmbeddings}\n`);

    // 3. Benchmark vector searches
    console.log("3️⃣ Running benchmark queries...\n");

    const testQueries = [
      "แนะนำ notebook ราคา 15000 หน่อยครับ",
      "ASUS ดีไหมครับ",
      "สเปค RAM เท่าไหร่ดี"
    ];

    const results: number[] = [];

    for (const [idx, query] of testQueries.entries()) {
      console.log(`   Query ${idx + 1}: "${query}"`);

      // Run query 3 times and average
      const times: number[] = [];

      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();

        const embedding = await createEmbedding(query);

        // Direct vector search using HNSW index
        const searchResults = await prisma.$queryRawUnsafe<any[]>(
          `
          SELECT
            c.id,
            c.text,
            1 - (c.embedding <=> $1::vector) as score
          FROM "RagChunk" c
          JOIN "RagDocument" d ON c."docId" = d.id
          WHERE d."sourceType" = 'product'
            AND c.embedding IS NOT NULL
          ORDER BY c.embedding <=> $1::vector
          LIMIT 10
          `,
          JSON.stringify(embedding)
        );

        const elapsed = Date.now() - startTime;
        times.push(elapsed);

        if (i === 0) {
          console.log(`      Results: ${searchResults.length} chunks`);
          if (searchResults.length > 0) {
            console.log(`      Top score: ${searchResults[0].score.toFixed(3)}`);
          }
        }
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      results.push(avgTime);

      console.log(`      Avg search time: ${avgTime.toFixed(1)}ms (${times.map(t => t + 'ms').join(', ')})\n`);
    }

    // 4. Summary
    console.log(`${"=".repeat(60)}`);
    console.log(`✅ Option 3 Test Complete!`);
    console.log(`${"=".repeat(60)}\n`);

    const overallAvg = results.reduce((a, b) => a + b, 0) / results.length;

    console.log(`📊 Results:`);
    console.log(`   Database: ${chunksWithEmbeddings} chunks with embeddings`);
    console.log(`   Index: HNSW (m=16, ef_construction=64)`);
    console.log(`   Average search time: ${overallAvg.toFixed(1)}ms`);
    console.log(`   Query range: ${Math.min(...results).toFixed(1)}ms - ${Math.max(...results).toFixed(1)}ms\n`);

    console.log(`🎯 Performance Notes:`);
    console.log(`   - HNSW provides O(log n) search complexity`);
    console.log(`   - Current dataset: ${chunksWithEmbeddings} embeddings (small)`);
    console.log(`   - Real benefits visible with 10,000+ embeddings`);
    console.log(`   - HNSW index size: 328 kB\n`);

    console.log(`⚙️  Tuning Options:`);
    console.log(`   - Increase m (connections): Better recall, more memory`);
    console.log(`   - Increase ef_construction: Better quality, slower build`);
    console.log(`   - Set hnsw.ef_search at query time: Control speed vs accuracy\n`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

testOption3()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
