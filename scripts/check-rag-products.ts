/**
 * Check what products are actually in RAG system
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkRagProducts() {
  console.log("Checking RAG Documents...\n");

  try {
    // Count total RAG documents
    const totalDocs = await prisma.ragDocument.count();
    console.log(`Total RAG documents: ${totalDocs}`);

    // Count by source type
    const productDocs = await prisma.ragDocument.count({
      where: { sourceType: "product" }
    });
    console.log(`Product documents: ${productDocs}`);

    const transcriptDocs = await prisma.ragDocument.count({
      where: { sourceType: "transcript" }
    });
    console.log(`Transcript documents: ${transcriptDocs}\n`);

    // Get sample product documents
    const sampleProducts = await prisma.ragDocument.findMany({
      where: { sourceType: "product" },
      select: {
        id: true,
        sourceId: true,
        sourceType: true,
        meta: true,
      },
      take: 10
    });

    console.log("Sample product documents:");
    sampleProducts.forEach(doc => {
      const meta = doc.meta as any;
      console.log(`  - sourceId: ${doc.sourceId}`);
      console.log(`    name: ${meta?.name?.substring(0, 50)}`);
      console.log(`    price: ${meta?.price}\n`);
    });

    // Check if any of our test IDs exist
    const testIds = ['24094115463', '24025934186', '24014221788'];
    console.log(`\nChecking for specific product IDs: ${testIds.join(', ')}`);

    const foundDocs = await prisma.ragDocument.findMany({
      where: {
        sourceType: "product",
        sourceId: { in: testIds }
      },
      select: {
        sourceId: true,
        meta: true
      }
    });

    console.log(`Found ${foundDocs.length} matching documents`);
    foundDocs.forEach(doc => {
      const meta = doc.meta as any;
      console.log(`  - ${doc.sourceId}: ${meta?.name?.substring(0, 50)}`);
    });

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRagProducts();
