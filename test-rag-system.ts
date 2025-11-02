/**
 * RAG System Test Script
 *
 * This script tests the RAG system with sample data to ensure everything is working correctly.
 * Run: npx tsx test-rag-system.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✓ ${message}`, colors.green);
}

function error(message: string) {
  log(`✗ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ ${message}`, colors.cyan);
}

function section(title: string) {
  console.log();
  log(`${"=".repeat(60)}`, colors.blue);
  log(` ${title}`, colors.blue);
  log(`${"=".repeat(60)}`, colors.blue);
  console.log();
}

/**
 * Test 1: Database Connection
 */
async function testDatabaseConnection(): Promise<boolean> {
  section("Test 1: Database Connection");

  try {
    await prisma.$queryRaw`SELECT 1`;
    success("Database connection successful");
    return true;
  } catch (err) {
    error(`Database connection failed: ${err}`);
    return false;
  }
}

/**
 * Test 2: pgvector Extension
 */
async function testPgvectorExtension(): Promise<boolean> {
  section("Test 2: pgvector Extension");

  try {
    const result = await prisma.$queryRaw<any[]>`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname = 'vector'
    `;

    if (result.length > 0) {
      success(`pgvector extension installed (version ${result[0].extversion})`);
      return true;
    } else {
      error("pgvector extension not found");
      info("Solution: Use pgvector/pgvector:pg16 Docker image");
      return false;
    }
  } catch (err) {
    error(`Failed to check pgvector: ${err}`);
    return false;
  }
}

/**
 * Test 3: RAG Tables Exist
 */
async function testRagTables(): Promise<boolean> {
  section("Test 3: RAG Tables");

  try {
    // Check RagDocument table
    const docCount = await prisma.ragDocument.count();
    success(`RagDocument table exists (${docCount} documents)`);

    // Check RagChunk table
    const chunkCount = await prisma.ragChunk.count();
    success(`RagChunk table exists (${chunkCount} chunks)`);

    // Check vector index
    const indexes = await prisma.$queryRaw<any[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'RagChunk'
      AND indexname = 'RagChunk_embedding_idx'
    `;

    if (indexes.length > 0) {
      success("HNSW vector index exists");
    } else {
      error("HNSW vector index not found");
      return false;
    }

    return true;
  } catch (err) {
    error(`Failed to check RAG tables: ${err}`);
    return false;
  }
}

/**
 * Test 4: OpenAI API Key
 */
async function testOpenAIKey(): Promise<boolean> {
  section("Test 4: OpenAI API Configuration");

  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;

  if (!apiKey) {
    error("OPENAI_API_KEY not found in environment variables");
    info("Set OPENAI_API_KEY in your .env.local file");
    return false;
  }

  if (apiKey.includes("set-openai-api-key")) {
    error("OPENAI_API_KEY is still set to placeholder value");
    info("Update OPENAI_API_KEY in your .env.local file with your actual API key");
    return false;
  }

  success("OPENAI_API_KEY is configured");

  // Check other config
  info(`Embedding Model: ${process.env.EMBED_MODEL || "text-embedding-3-small"}`);
  info(`Embedding Dimensions: ${process.env.EMBED_DIMENSIONS || "1536"}`);
  info(`Chat Model: ${process.env.CHAT_MODEL || process.env.AI_MODEL || "gpt-4o-mini"}`);
  info(`Top K: ${process.env.RAG_TOP_K || "6"}`);
  info(`Max Context Tokens: ${process.env.RAG_MAX_CONTEXT_TOKENS || "2800"}`);

  return true;
}

/**
 * Test 5: Ingest Sample Transcript
 */
async function testIngestTranscript(): Promise<boolean> {
  section("Test 5: Ingest Sample Transcript");

  try {
    const { ingestTranscript } = await import("./lib/rag/ingest");

    const sampleTranscript = {
      videoId: "test-video-001",
      title: "Test Video: Introduction to RAG Systems",
      channelName: "Test Channel",
      publishedAt: new Date().toISOString(),
      transcript: `
        Welcome to this tutorial about Retrieval Augmented Generation systems.
        In this video, we'll explore how RAG works and why it's useful for building intelligent chatbots.
        RAG combines the power of large language models with external knowledge retrieval.
        This allows the AI to provide accurate, context-aware responses based on your specific data.
        We'll cover embeddings, vector databases, and semantic search in detail.
        By the end of this tutorial, you'll understand how to implement a RAG system for your own projects.
      `,
      duration: 360,
      viewCount: 100,
    };

    info("Ingesting sample transcript...");
    const result = await ingestTranscript(sampleTranscript, true); // overwrite if exists

    success(`Transcript ingested successfully`);
    info(`  Document ID: ${result.docId}`);
    info(`  Chunks created: ${result.chunksCreated}`);

    return true;
  } catch (err) {
    error(`Failed to ingest transcript: ${err}`);
    if ((err as Error).message.includes("OPENAI_API_KEY")) {
      info("Make sure your OpenAI API key is valid and has credits");
    }
    return false;
  }
}

/**
 * Test 6: Ingest Sample Product
 */
async function testIngestProduct(): Promise<boolean> {
  section("Test 6: Ingest Sample Product");

  try {
    const { ingestProduct } = await import("./lib/rag/ingest");

    const sampleProduct = {
      productId: "test-product-001",
      name: "Professional Microphone for YouTube",
      description: `
        High-quality USB microphone perfect for YouTube content creators and podcasters.
        Features crystal-clear audio recording, noise cancellation, and plug-and-play setup.
        Compatible with all major recording software. Includes adjustable stand and pop filter.
        Ideal for gaming, streaming, voice-overs, and music recording.
      `,
      price: 1999.00,
      url: "https://example.com/microphone",
      category: "audio-equipment",
      tags: ["microphone", "youtube", "recording", "audio"],
    };

    info("Ingesting sample product...");
    const result = await ingestProduct(sampleProduct, true); // overwrite if exists

    success(`Product ingested successfully`);
    info(`  Document ID: ${result.docId}`);
    info(`  Chunks created: ${result.chunksCreated} (summary + details)`);

    return true;
  } catch (err) {
    error(`Failed to ingest product: ${err}`);
    return false;
  }
}

/**
 * Test 7: Ingest Sample Comment
 */
async function testIngestComment(): Promise<boolean> {
  section("Test 7: Ingest Sample Comment");

  try {
    const { ingestComment } = await import("./lib/rag/ingest");

    const sampleComment = {
      commentId: "test-comment-001",
      videoId: "test-video-001",
      authorName: "Test User",
      text: "Great tutorial! Can you recommend a good microphone for recording YouTube videos?",
      publishedAt: new Date().toISOString(),
      likeCount: 5,
      isReply: false,
    };

    info("Ingesting sample comment...");
    const result = await ingestComment(sampleComment, true); // overwrite if exists

    success(`Comment ingested successfully`);
    info(`  Document ID: ${result.docId}`);
    info(`  Chunks created: ${result.chunksCreated}`);

    return true;
  } catch (err) {
    error(`Failed to ingest comment: ${err}`);
    return false;
  }
}

/**
 * Test 8: Vector Search
 */
async function testVectorSearch(): Promise<boolean> {
  section("Test 8: Vector Search");

  try {
    const { createEmbedding } = await import("./lib/rag/openai");
    const { vectorSearch } = await import("./lib/rag/retriever");

    const query = "What is RAG?";
    info(`Searching for: "${query}"`);

    const queryEmbedding = await createEmbedding(query);
    success(`Generated query embedding (${queryEmbedding.length} dimensions)`);

    const results = await vectorSearch(queryEmbedding, {
      topK: 3,
      minScore: 0.0,
    });

    if (results.length > 0) {
      success(`Found ${results.length} results`);
      results.forEach((r, idx) => {
        info(`  ${idx + 1}. [${r.sourceType}] Score: ${r.score.toFixed(3)}`);
        info(`     "${r.text.slice(0, 100)}..."`);
      });
      return true;
    } else {
      error("No results found");
      info("Make sure you've ingested some data first");
      return false;
    }
  } catch (err) {
    error(`Failed vector search: ${err}`);
    return false;
  }
}

/**
 * Test 9: Hybrid Search
 */
async function testHybridSearch(): Promise<boolean> {
  section("Test 9: Hybrid Search");

  try {
    const { hybridSearch } = await import("./lib/rag/retriever");

    const query = "microphone for YouTube";
    info(`Searching for: "${query}"`);

    const results = await hybridSearch(query, {
      topK: 3,
      minScore: 0.2,
    });

    if (results.length > 0) {
      success(`Found ${results.length} results (vector + keyword)`);
      results.forEach((r, idx) => {
        info(`  ${idx + 1}. [${r.sourceType}] Score: ${r.score.toFixed(3)}`);
        info(`     "${r.text.slice(0, 100)}..."`);
      });
      return true;
    } else {
      error("No results found");
      return false;
    }
  } catch (err) {
    error(`Failed hybrid search: ${err}`);
    return false;
  }
}

/**
 * Test 10: Generate Answer
 */
async function testGenerateAnswer(): Promise<boolean> {
  section("Test 10: Generate Answer");

  try {
    const { generateAnswer } = await import("./lib/rag/answer");

    const query = "Can you recommend a good microphone for YouTube?";
    info(`Query: "${query}"`);

    const response = await generateAnswer({
      query,
      videoId: "test-video-001",
      includeProducts: true,
      includeTranscripts: true,
      includeComments: false,
      temperature: 0.7,
    });

    success("Answer generated successfully");
    console.log();
    log("Answer:", colors.green);
    console.log(response.answer);
    console.log();

    info(`Contexts used: ${response.contexts.length}`);
    info(`Total tokens: ${response.tokenUsage.totalTokens}`);
    info(`Model: ${response.model}`);

    response.contexts.forEach((c, idx) => {
      info(`  ${idx + 1}. [${c.sourceType}] Score: ${c.score.toFixed(3)}`);
    });

    return true;
  } catch (err) {
    error(`Failed to generate answer: ${err}`);
    return false;
  }
}

/**
 * Test 11: Statistics
 */
async function testStatistics(): Promise<boolean> {
  section("Test 11: Statistics");

  try {
    const { getRagStats, getRagHealth } = await import("./lib/rag/stats");

    // Get health
    const health = await getRagHealth();

    if (health.status === "healthy") {
      success(`System status: ${health.status}`);
    } else {
      log(`System status: ${health.status}`, colors.yellow);
      health.issues.forEach(issue => info(`  - ${issue}`));
    }

    // Get stats
    const stats = await getRagStats();

    console.log();
    info("Overview:");
    info(`  Total documents: ${stats.overview.totalDocuments}`);
    info(`  Total chunks: ${stats.overview.totalChunks}`);
    info(`  Chunks with embeddings: ${stats.overview.chunksWithEmbeddings}`);
    info(`  Embedding coverage: ${stats.overview.embeddingCoverage}%`);
    info(`  Estimated storage: ${stats.overview.estimatedStorageKB} KB`);

    console.log();
    info("By Source Type:");
    info(`  Comments: ${stats.bySourceType.comments.documents} docs, ${stats.bySourceType.comments.chunks} chunks`);
    info(`  Transcripts: ${stats.bySourceType.transcripts.documents} docs, ${stats.bySourceType.transcripts.chunks} chunks`);
    info(`  Products: ${stats.bySourceType.products.documents} docs, ${stats.bySourceType.products.chunks} chunks`);

    return true;
  } catch (err) {
    error(`Failed to get statistics: ${err}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log();
  log("╔════════════════════════════════════════════════════════════╗", colors.blue);
  log("║              RAG SYSTEM TEST SUITE                         ║", colors.blue);
  log("╚════════════════════════════════════════════════════════════╝", colors.blue);

  const tests = [
    { name: "Database Connection", fn: testDatabaseConnection, critical: true },
    { name: "pgvector Extension", fn: testPgvectorExtension, critical: true },
    { name: "RAG Tables", fn: testRagTables, critical: true },
    { name: "OpenAI Configuration", fn: testOpenAIKey, critical: true },
    { name: "Ingest Transcript", fn: testIngestTranscript, critical: false },
    { name: "Ingest Product", fn: testIngestProduct, critical: false },
    { name: "Ingest Comment", fn: testIngestComment, critical: false },
    { name: "Vector Search", fn: testVectorSearch, critical: false },
    { name: "Hybrid Search", fn: testHybridSearch, critical: false },
    { name: "Generate Answer", fn: testGenerateAnswer, critical: false },
    { name: "Statistics", fn: testStatistics, critical: false },
  ];

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
        if (test.critical) {
          log(`\nCritical test failed. Stopping tests.`, colors.red);
          break;
        }
      }
    } catch (err) {
      error(`Unexpected error in ${test.name}: ${err}`);
      failed++;
      if (test.critical) {
        log(`\nCritical test failed. Stopping tests.`, colors.red);
        break;
      }
    }
  }

  // Summary
  section("Test Summary");

  const total = passed + failed + skipped;
  log(`Total: ${total}`, colors.cyan);
  log(`Passed: ${passed}`, colors.green);
  if (failed > 0) log(`Failed: ${failed}`, colors.red);
  if (skipped > 0) log(`Skipped: ${skipped}`, colors.yellow);

  console.log();

  if (failed === 0) {
    success("All tests passed! 🎉");
    success("Your RAG system is ready to use!");
  } else {
    error("Some tests failed. Please check the errors above.");
  }

  console.log();

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
