/**
 * Apply HNSW index directly via SQL
 */

import { prisma } from "@/lib/db";

async function applyHNSWIndex() {
  console.log("🔧 Applying HNSW index to RagChunk.embedding...\n");

  try {
    // Drop existing index if it exists
    console.log("1️⃣ Dropping existing index if it exists...");
    await prisma.$executeRaw`DROP INDEX IF EXISTS "RagChunk_embedding_hnsw_idx"`;
    console.log("   ✅ Done\n");

    // Create HNSW index
    console.log("2️⃣ Creating HNSW index...");
    console.log("   This may take a while depending on data size...");

    const startTime = Date.now();

    await prisma.$executeRaw`
      CREATE INDEX "RagChunk_embedding_hnsw_idx"
      ON "RagChunk"
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `;

    const elapsed = Date.now() - startTime;

    console.log(`   ✅ Index created in ${elapsed}ms\n`);

    // Verify index was created
    console.log("3️⃣ Verifying index...");
    const indexes = await prisma.$queryRaw<any[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'RagChunk'
        AND indexname = 'RagChunk_embedding_hnsw_idx'
    `;

    if (indexes.length > 0) {
      console.log("   ✅ HNSW index verified!");
      console.log(`   ${indexes[0].indexdef}\n`);
    } else {
      console.log("   ❌ Index not found!\n");
    }

    // Get index size
    const sizeResult = await prisma.$queryRaw<any[]>`
      SELECT pg_size_pretty(pg_relation_size('"RagChunk_embedding_hnsw_idx"')) as size
    `;

    console.log(`📊 Index size: ${sizeResult[0]?.size || 'Unknown'}`);

    console.log("\n✅ HNSW index application complete!");
    console.log("\n💡 Note: Vector searches will now use HNSW index for faster queries.");
    console.log("   Set hnsw.ef_search parameter to control speed vs accuracy tradeoff.");

  } catch (error: any) {
    console.error("\n❌ Failed to apply HNSW index:", error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyHNSWIndex();
