/**
 * Check product categories in RAG database
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkProductCategories() {
  console.log("=".repeat(80));
  console.log("Checking product categories in RAG database");
  console.log("=".repeat(80));

  try {
    // Get sample of product chunks with metadata
    const productChunks = await prisma.$queryRaw<Array<{
      id: number;
      docId: number;
      text: string;
      meta: any;
      sourceType: string;
      sourceId: string;
    }>>`
      SELECT
        c.id,
        c."docId",
        c.text,
        c.meta,
        d."sourceType",
        d."sourceId"
      FROM "RagChunk" c
      JOIN "RagDocument" d ON c."docId" = d.id
      WHERE d."sourceType" = 'product'
      LIMIT 10
    `;

    console.log(`\nFound ${productChunks.length} product chunks`);

    if (productChunks.length > 0) {
      console.log("\nSample product chunks:");
      productChunks.forEach((chunk, idx) => {
        console.log(`\n${idx + 1}. Chunk ID: ${chunk.id}`);
        console.log(`   Source ID: ${chunk.sourceId}`);
        console.log(`   Text: ${chunk.text.substring(0, 100)}...`);
        console.log(`   Meta:`, JSON.stringify(chunk.meta, null, 2));
      });

      // Check unique categories
      const categories = new Set<string>();
      productChunks.forEach((chunk) => {
        if (chunk.meta && chunk.meta.category) {
          categories.add(chunk.meta.category);
        }
      });

      console.log(`\n📊 Unique categories found: ${categories.size}`);
      if (categories.size > 0) {
        console.log("Categories:", Array.from(categories).join(", "));
      } else {
        console.log("⚠️  No category metadata found in chunks!");
      }
    }

    // Check total product documents
    const totalProductDocs = await prisma.ragDocument.count({
      where: { sourceType: "product" },
    });
    console.log(`\n📦 Total product documents: ${totalProductDocs}`);

    // Check total product chunks
    const totalProductChunks = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "RagChunk" c
      JOIN "RagDocument" d ON c."docId" = d.id
      WHERE d."sourceType" = 'product'
    `;
    console.log(`📦 Total product chunks: ${totalProductChunks[0].count}`);

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProductCategories();
