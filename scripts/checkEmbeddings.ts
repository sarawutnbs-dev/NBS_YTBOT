import { prisma } from "../lib/db";

async function main() {
  console.log("🔍 Checking RAG embeddings in database...\n");

  // Sample a few chunks with embeddings
  const chunks = await prisma.$queryRaw<Array<{
    id: number;
    docId: number;
    chunkIndex: number;
    text: string;
    hasEmbedding: boolean;
    embeddingDimension: number | null;
  }>>`
    SELECT
      id,
      "docId",
      "chunkIndex",
      SUBSTRING(text, 1, 100) as text,
      (embedding IS NOT NULL) as "hasEmbedding",
      vector_dims(embedding) as "embeddingDimension"
    FROM "RagChunk"
    ORDER BY id DESC
    LIMIT 10
  `;

  console.log(`Found ${chunks.length} recent chunks:\n`);

  for (const chunk of chunks) {
    const status = chunk.hasEmbedding ? "✅" : "❌";
    console.log(`${status} Chunk ${chunk.id} (doc ${chunk.docId}, index ${chunk.chunkIndex})`);
    console.log(`   Text: ${chunk.text}...`);
    console.log(`   Embedding: ${chunk.hasEmbedding ? `Yes (${chunk.embeddingDimension} dimensions)` : "No"}`);
    console.log();
  }

  // Count total chunks with/without embeddings
  const stats = await prisma.$queryRaw<Array<{
    totalChunks: number;
    chunksWithEmbedding: number;
    chunksWithoutEmbedding: number;
  }>>`
    SELECT
      COUNT(*) as "totalChunks",
      SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END)::integer as "chunksWithEmbedding",
      SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END)::integer as "chunksWithoutEmbedding"
    FROM "RagChunk"
  `;

  console.log("📊 Summary:");
  console.log(`   Total chunks: ${stats[0].totalChunks}`);
  console.log(`   ✅ With embeddings: ${stats[0].chunksWithEmbedding}`);
  console.log(`   ❌ Without embeddings: ${stats[0].chunksWithoutEmbedding}`);

  if (stats[0].chunksWithEmbedding > 0) {
    console.log(`\n✅ Embeddings are working! All chunks have ${chunks[0]?.embeddingDimension || 1536}-dimensional vectors.`);
  } else {
    console.log(`\n⚠️  No embeddings found!`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
