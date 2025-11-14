/**
 * Test alternative product lookup strategies
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testLookup() {
  console.log("=".repeat(60));
  console.log("Testing Product Lookup Strategies");
  console.log("=".repeat(60));

  try {
    // Get sample sourceIds from RagDocument
    const sampleDocs = await prisma.ragDocument.findMany({
      where: { sourceType: "product" },
      select: { sourceId: true },
      take: 10
    });

    const sourceIds = sampleDocs.map(d => d.sourceId);
    console.log(`\n[1] Sample sourceIds from RagDocument (${sourceIds.length} items):`);
    console.log(sourceIds.slice(0, 5));

    // Strategy 1: Match by shopeeProductId (current approach)
    console.log("\n[2] Strategy 1: Match by shopeeProductId");
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

    console.log(`   Found: ${productsByShopeeId.length} products`);

    // Strategy 2: Match by Product.id (alternative)
    console.log("\n[3] Strategy 2: Match by Product.id");
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

    console.log(`   Found: ${productsById.length} products`);

    // Strategy 3: Check meta.name match
    console.log("\n[4] Strategy 3: Use meta.name from RagDocument");
    const docsWithMeta = await prisma.ragDocument.findMany({
      where: { sourceType: "product" },
      select: {
        sourceId: true,
        meta: true
      },
      take: 5
    });

    console.log("   Sample RagDocument with meta:");
    docsWithMeta.forEach((doc, i) => {
      const meta = doc.meta as any;
      console.log(`   ${i + 1}. sourceId: ${doc.sourceId}`);
      console.log(`      name: ${meta.name}`);
      console.log(`      url: ${meta.url}`);
    });

    // Try to find products by name
    if (docsWithMeta.length > 0) {
      const firstMeta = docsWithMeta[0].meta as any;
      const productByName = await prisma.product.findFirst({
        where: {
          name: { contains: firstMeta.name.substring(0, 20) }
        },
        select: {
          id: true,
          shopeeProductId: true,
          name: true
        }
      });

      console.log(`\n   Trying to find by name match: "${firstMeta.name.substring(0, 30)}..."`);
      console.log(`   Result:`, productByName ? "Found!" : "Not found");
      if (productByName) {
        console.log(`      Product.id: ${productByName.id}`);
        console.log(`      shopeeProductId: ${productByName.shopeeProductId}`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("Recommendation:");
    console.log("=".repeat(60));

    if (productsById.length > 0) {
      console.log("✅ Use Product.id for matching (Strategy 2)");
      console.log("   RagDocument.sourceId appears to be Product.id");
    } else if (productsByShopeeId.length > 0) {
      console.log("✅ Use shopeeProductId for matching (Strategy 1)");
      console.log("   RagDocument.sourceId appears to be shopeeProductId");
    } else {
      console.log("❌ Data mismatch - need to re-index products");
      console.log("   RagDocument contains old/stale product data");
      console.log("   Recommendation: Run product embedding/indexing again");
    }

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testLookup();
