/**
 * Debug: Check product sourceId format
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function debugSourceId() {
  console.log("=".repeat(60));
  console.log("Debugging Product sourceId");
  console.log("=".repeat(60));

  try {
    // Check sample product RAG documents
    console.log("\n[1] Sample RagDocument (product):");
    const sampleDocs = await prisma.ragDocument.findMany({
      where: { sourceType: "product" },
      select: {
        id: true,
        sourceId: true,
        sourceType: true,
        meta: true
      },
      take: 3
    });

    sampleDocs.forEach((doc, i) => {
      console.log(`\n   Document ${i + 1}:`);
      console.log(`   - ID: ${doc.id}`);
      console.log(`   - sourceId: ${doc.sourceId}`);
      console.log(`   - sourceType: ${doc.sourceType}`);
      console.log(`   - meta:`, doc.meta);
    });

    // Check if any sourceId matches shopeeProductId
    if (sampleDocs.length > 0) {
      const sourceIds = sampleDocs.map(d => d.sourceId);

      console.log("\n[2] Checking if sourceIds match shopeeProductId:");
      const productsByShopeeId = await prisma.product.findMany({
        where: {
          shopeeProductId: { in: sourceIds }
        },
        select: {
          id: true,
          shopeeProductId: true,
          name: true
        }
      });

      console.log(`   Found ${productsByShopeeId.length} matches by shopeeProductId`);

      // Check if sourceId matches Product.id instead
      console.log("\n[3] Checking if sourceIds match Product.id:");
      const productsById = await prisma.product.findMany({
        where: {
          id: { in: sourceIds }
        },
        select: {
          id: true,
          shopeeProductId: true,
          name: true
        }
      });

      console.log(`   Found ${productsById.length} matches by Product.id`);

      if (productsById.length > 0) {
        console.log("\n   ✅ Sample matching products:");
        productsById.slice(0, 3).forEach((p, i) => {
          console.log(`      ${i + 1}. ${p.name.substring(0, 50)}...`);
          console.log(`         Product.id: ${p.id}`);
          console.log(`         shopeeProductId: ${p.shopeeProductId}`);
        });
      }
    }

    // Check the specific sample IDs from search results
    console.log("\n[4] Checking sample IDs from search: 40964440826, 24746818356");
    const testIds = ["40964440826", "24746818356", "44351523417"];

    const productsByShopeeTest = await prisma.product.findMany({
      where: {
        shopeeProductId: { in: testIds }
      }
    });

    console.log(`   Found ${productsByShopeeTest.length} by shopeeProductId`);

    const productsByIdTest = await prisma.product.findMany({
      where: {
        id: { in: testIds }
      }
    });

    console.log(`   Found ${productsByIdTest.length} by Product.id`);

    console.log("\n" + "=".repeat(60));
    console.log("Summary:");
    console.log("=".repeat(60));

    if (productsByIdTest.length > 0) {
      console.log("✅ RagDocument.sourceId = Product.id (Internal ID)");
      console.log("   The search is using Product.id, not shopeeProductId!");
    } else if (productsByShopeeTest.length > 0) {
      console.log("✅ RagDocument.sourceId = Product.shopeeProductId");
    } else {
      console.log("❌ No matches found - data may be inconsistent");
    }

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

debugSourceId();
