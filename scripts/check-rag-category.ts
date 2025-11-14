/**
 * Check if RAG chunks have category metadata
 */

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ override: true });
dotenv.config({ override: false });

const prisma = new PrismaClient();

async function checkRagCategory() {
  console.log("🔍 Checking RAG chunks for category metadata...\n");

  // Check a sample of product chunks
  const chunks = await prisma.$queryRaw<any[]>`
    SELECT
      c.id,
      c.text,
      c.meta->>'category' as category,
      c.meta->>'name' as name,
      c.meta->>'price' as price,
      d."sourceId"
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'product'
    LIMIT 10
  `;

  console.log(`📦 Sample of ${chunks.length} product chunks:\n`);

  for (const chunk of chunks) {
    console.log(`Product ID: ${chunk.sourceId}`);
    console.log(`  Name: ${chunk.name?.substring(0, 60) || 'N/A'}`);
    console.log(`  Category: ${chunk.category || 'MISSING!'}`);
    console.log(`  Price: ${chunk.price || 'N/A'}`);
    console.log(`  Text preview: ${chunk.text.substring(0, 80)}...\n`);
  }

  // Count chunks by category
  const categoryStats = await prisma.$queryRaw<any[]>`
    SELECT
      c.meta->>'category' as category,
      COUNT(*) as count
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'product'
    GROUP BY c.meta->>'category'
    ORDER BY COUNT(*) DESC
  `;

  console.log("\n📊 Category distribution in RAG chunks:\n");
  for (const stat of categoryStats) {
    console.log(`  ${stat.category || 'NULL'}: ${stat.count} chunks`);
  }

  // Total counts
  const totalChunks = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::int as count
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'product'
  `;

  const chunksWithCategory = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::int as count
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'product'
      AND c.meta->>'category' IS NOT NULL
  `;

  console.log("\n📈 Summary:");
  console.log(`  Total product chunks: ${totalChunks[0].count}`);
  console.log(`  Chunks with category: ${chunksWithCategory[0].count}`);
  console.log(`  Chunks without category: ${Number(totalChunks[0].count) - Number(chunksWithCategory[0].count)}`);

  await prisma.$disconnect();
}

checkRagCategory().catch(console.error);
