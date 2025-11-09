import { prisma } from "../lib/db";
import { createEmbeddings } from "../lib/rag/openai";

async function main() {
  console.log("🔧 Finding chunks without embeddings...\n");

  // Find chunks without embeddings
  const chunksWithoutEmbeddings = await prisma.$queryRaw<Array<{
    id: number;
    docId: number;
    chunkIndex: number;
    text: string;
  }>>`
    SELECT id, "docId", "chunkIndex", text
    FROM "RagChunk"
    WHERE embedding IS NULL
    ORDER BY id
  `;

  console.log(`Found ${chunksWithoutEmbeddings.length} chunks without embeddings\n`);

  if (chunksWithoutEmbeddings.length === 0) {
    console.log("✅ All chunks have embeddings!");
    await prisma.$disconnect();
    return;
  }

  let success = 0;
  let failed = 0;

  // Process in batches of 64
  const batchSize = 64;

  for (let i = 0; i < chunksWithoutEmbeddings.length; i += batchSize) {
    const batch = chunksWithoutEmbeddings.slice(i, i + batchSize);

    try {
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunksWithoutEmbeddings.length / batchSize)} (${batch.length} chunks)...`);

      // Generate embeddings for batch
      const texts = batch.map((c) => c.text);
      const embeddings = await createEmbeddings(texts);

      // Update each chunk with its embedding
      await Promise.all(
        batch.map((chunk, idx) =>
          prisma.$executeRaw`
            UPDATE "RagChunk"
            SET embedding = ${JSON.stringify(embeddings[idx])}::vector
            WHERE id = ${chunk.id}
          `
        )
      );

      console.log(`   ✅ Generated embeddings for ${batch.length} chunks\n`);
      success += batch.length;

      // Small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`   ❌ Error:`, error instanceof Error ? error.message : error);
      failed += batch.length;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Success: ${success} chunks`);
  console.log(`   ❌ Failed: ${failed} chunks`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
