/**
 * Test SQL category filtering directly
 */

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ override: false });

const prisma = new PrismaClient();

async function testSQLFilter() {
  console.log("Testing SQL category filter\n");

  // Test 1: Get products WITHOUT category filter
  console.log("Test 1: Products WITHOUT category filter (top 5)");
  const noFilter = await prisma.$queryRaw<any[]>`
    SELECT
      d."sourceId",
      c.meta->>'category' as category,
      c.meta->>'name' as name
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'product'
    LIMIT 5
  `;

  for (const row of noFilter) {
    console.log(`  ${row.sourceId} - ${row.category} - ${row.name?.substring(0, 40)}`);
  }
  console.log();

  // Test 2: Get products WITH category filter = 'Notebook'
  console.log("Test 2: Products WITH category filter = 'Notebook' (top 5)");
  const notebookFilter = await prisma.$queryRaw<any[]>`
    SELECT
      d."sourceId",
      c.meta->>'category' as category,
      c.meta->>'name' as name
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'product'
      AND c.meta->>'category' = 'Notebook'
    LIMIT 5
  `;

  console.log(`Found ${notebookFilter.length} notebooks`);
  for (const row of notebookFilter) {
    console.log(`  ${row.sourceId} - ${row.category} - ${row.name?.substring(0, 40)}`);
  }
  console.log();

  // Test 3: Get products WITH category filter = 'RAM'
  console.log("Test 3: Products WITH category filter = 'RAM' (top 5)");
  const ramFilter = await prisma.$queryRaw<any[]>`
    SELECT
      d."sourceId",
      c.meta->>'category' as category,
      c.meta->>'name' as name
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'product'
      AND c.meta->>'category' = 'RAM'
    LIMIT 5
  `;

  console.log(`Found ${ramFilter.length} RAM products`);
  for (const row of ramFilter) {
    console.log(`  ${row.sourceId} - ${row.category} - ${row.name?.substring(0, 40)}`);
  }
  console.log();

  // Test 4: Count by category
  console.log("Test 4: Count products by category");
  const counts = await prisma.$queryRaw<any[]>`
    SELECT
      c.meta->>'category' as category,
      COUNT(*) as count
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'product'
    GROUP BY c.meta->>'category'
    ORDER BY COUNT(*) DESC
  `;

  for (const row of counts) {
    console.log(`  ${row.category || 'NULL'}: ${row.count}`);
  }

  await prisma.$disconnect();
}

testSQLFilter().catch(console.error);
