/**
 * Manual RAG Testing Script
 *
 * Simple tests you can run without authentication.
 * Uncomment the test you want to run.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Testing RAG System...\n");

  // ============================================================
  // TEST 1: Check Database Connection
  // ============================================================
  console.log("1️⃣  Testing database connection...");
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connected!\n");
  } catch (error) {
    console.error("❌ Database error:", error);
    process.exit(1);
  }

  // ============================================================
  // TEST 2: Check Current Data
  // ============================================================
  console.log("2️⃣  Checking existing data...");
  const docCount = await prisma.ragDocument.count();
  const chunkCount = await prisma.ragChunk.count();

  console.log(`📄 Documents: ${docCount}`);
  console.log(`📦 Chunks: ${chunkCount}\n`);

  // ============================================================
  // TEST 3: Ingest Sample Data (Uncomment to run)
  // ============================================================
  /*
  console.log("3️⃣  Ingesting sample transcript...");
  const { ingestTranscript } = await import("./lib/rag/ingest");

  const result = await ingestTranscript({
    videoId: "test-001",
    title: "Test Video",
    channelName: "Test Channel",
    transcript: "This is a test transcript about RAG systems and vector databases.",
    publishedAt: new Date().toISOString(),
  }, true);

  console.log(`✅ Created ${result.chunksCreated} chunks!\n`);
  */

  // ============================================================
  // TEST 4: Search Test (Uncomment to run - needs data first)
  // ============================================================
  /*
  console.log("4️⃣  Testing search...");
  const { hybridSearch } = await import("./lib/rag/retriever");

  const results = await hybridSearch("What is RAG?", {
    topK: 3,
    minScore: 0.2,
  });

  console.log(`🔍 Found ${results.length} results:`);
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. [${r.sourceType}] Score: ${r.score.toFixed(3)}`);
    console.log(`   ${r.text.slice(0, 100)}...`);
  });
  */

  // ============================================================
  // TEST 5: Generate Answer (Uncomment to run - needs data first)
  // ============================================================
  /*
  console.log("5️⃣  Generating answer...");
  const { generateAnswer } = await import("./lib/rag/answer");

  const response = await generateAnswer({
    query: "What is this about?",
    includeTranscripts: true,
    includeProducts: false,
    temperature: 0.7,
  });

  console.log("\n📝 Answer:");
  console.log(response.answer);
  console.log(`\n💰 Tokens used: ${response.tokenUsage.totalTokens}`);
  */

  // ============================================================
  // TEST 6: Get Statistics
  // ============================================================
  console.log("6️⃣  Getting statistics...");
  const { getRagStats } = await import("./lib/rag/stats");

  const stats = await getRagStats();

  console.log("\n📊 Statistics:");
  console.log(`   Total Documents: ${stats.overview.totalDocuments}`);
  console.log(`   Total Chunks: ${stats.overview.totalChunks}`);
  console.log(`   Embedding Coverage: ${stats.overview.embeddingCoverage}%`);
  console.log(`   Storage: ${stats.overview.estimatedStorageKB} KB`);

  console.log("\n📁 By Type:");
  console.log(`   Comments: ${stats.bySourceType.comments.documents} docs`);
  console.log(`   Transcripts: ${stats.bySourceType.transcripts.documents} docs`);
  console.log(`   Products: ${stats.bySourceType.products.documents} docs`);

  console.log("\n✅ Tests complete!");

  await prisma.$disconnect();
}

main().catch(console.error);
