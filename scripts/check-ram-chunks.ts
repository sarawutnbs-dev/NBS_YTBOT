/**
 * Check RAG chunks for RAM products
 */

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ override: false });

const prisma = new PrismaClient();

async function checkRagChunks() {
  const productIds = ['28261761837', '27809491433', '27510133539'];

  console.log("Checking RAG chunks for RAM products:\n");

  for (const id of productIds) {
    const chunks = await prisma.$queryRaw<any[]>`
      SELECT
        c.id,
        c.text,
        c.meta->>'category' as category,
        c.meta->>'name' as name,
        d."sourceId"
      FROM "RagChunk" c
      JOIN "RagDocument" d ON c."docId" = d.id
      WHERE d."sourceType" = 'product'
        AND d."sourceId" = ${id}
      LIMIT 1
    `;

    if (chunks.length > 0) {
      console.log(`Product ID: ${id}`);
      console.log(`  Category in RAG: ${chunks[0]?.category || 'MISSING!'}`);
      console.log(`  Name: ${chunks[0]?.name?.substring(0, 60)}`);
      console.log(`  Text preview: ${chunks[0]?.text?.substring(0, 80)}...\n`);
    } else {
      console.log(`Product ID: ${id} - NO RAG CHUNKS FOUND!\n`);
    }
  }

  await prisma.$disconnect();
}

checkRagChunks();
