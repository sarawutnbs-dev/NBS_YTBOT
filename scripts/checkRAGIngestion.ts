import { prisma } from "../lib/db";

async function main() {
  console.log("🔍 Checking RAG ingestion status...\n");

  // Check recent transcript documents
  const recentDocs = await prisma.ragDocument.findMany({
    where: {
      sourceType: "transcript",
    },
    select: {
      id: true,
      sourceId: true,
      createdAt: true,
      _count: {
        select: {
          chunks: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  });

  console.log(`Found ${recentDocs.length} recent transcript documents:\n`);

  for (const doc of recentDocs) {
    console.log(`📄 Document ID: ${doc.id}`);
    console.log(`   Video ID: ${doc.sourceId}`);
    console.log(`   Chunks: ${doc._count.chunks}`);
    console.log(`   Created: ${doc.createdAt.toISOString()}`);

    // Get sample chunk text
    const sampleChunk = await prisma.ragChunk.findFirst({
      where: { docId: doc.id },
      select: {
        text: true,
        chunkIndex: true,
      },
    });

    if (sampleChunk) {
      console.log(`   Sample (chunk ${sampleChunk.chunkIndex}): ${sampleChunk.text.substring(0, 100)}...`);
    }

    console.log();
  }

  // Check for any documents without chunks
  const docsWithoutChunks = await prisma.ragDocument.findMany({
    where: {
      sourceType: "transcript",
      chunks: {
        none: {},
      },
    },
    select: {
      id: true,
      sourceId: true,
    },
  });

  if (docsWithoutChunks.length > 0) {
    console.log(`⚠️  Found ${docsWithoutChunks.length} documents without chunks:`);
    docsWithoutChunks.forEach((doc) => {
      console.log(`   - Video ID: ${doc.sourceId} (Doc ID: ${doc.id})`);
    });
  } else {
    console.log("✅ All transcript documents have chunks!");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
