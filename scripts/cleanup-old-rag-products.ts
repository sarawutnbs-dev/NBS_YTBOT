/**
 * Clean up old RAG products that don't exist in Product table
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanupOldRagProducts(options: { dryRun?: boolean } = {}) {
  const { dryRun = false } = options;

  console.log("🧹 Cleaning up old RAG products...\n");
  console.log(`Dry run: ${dryRun}\n`);

  try {
    // 1. Get all RAG product documents
    const ragProducts = await prisma.ragDocument.findMany({
      where: { sourceType: "product" },
      select: {
        id: true,
        sourceId: true,
      }
    });

    console.log(`📦 Found ${ragProducts.length} RAG product documents\n`);

    // 2. Get all valid shopeeProductIds from Product table
    const validProducts = await prisma.product.findMany({
      select: { shopeeProductId: true }
    });

    const validProductIds = new Set(validProducts.map(p => p.shopeeProductId));
    console.log(`✅ Found ${validProductIds.size} valid products in Product table\n`);

    // 3. Find RAG products that don't exist in Product table
    const oldRagProducts = ragProducts.filter(rag => !validProductIds.has(rag.sourceId));

    console.log(`🗑️  Found ${oldRagProducts.length} old RAG products to delete\n`);

    if (oldRagProducts.length === 0) {
      console.log("✅ No old products to clean up!");
      return {
        success: true,
        deleted: 0,
        total: ragProducts.length
      };
    }

    if (dryRun) {
      console.log("🔍 DRY RUN - Would delete these products:");
      oldRagProducts.slice(0, 20).forEach(p => {
        console.log(`  - ${p.sourceId} (docId: ${p.id})`);
      });
      if (oldRagProducts.length > 20) {
        console.log(`  ... and ${oldRagProducts.length - 20} more`);
      }
      return {
        success: true,
        dryRun: true,
        wouldDelete: oldRagProducts.length,
        total: ragProducts.length
      };
    }

    // 4. Delete old RAG products
    console.log("🗑️  Deleting old products...\n");

    const oldDocIds = oldRagProducts.map(p => p.id);

    // Delete in batches
    const batchSize = 500;
    let deleted = 0;

    for (let i = 0; i < oldDocIds.length; i += batchSize) {
      const batch = oldDocIds.slice(i, i + batchSize);

      // Delete chunks first
      await prisma.ragChunk.deleteMany({
        where: { docId: { in: batch } }
      });

      // Then delete documents
      await prisma.ragDocument.deleteMany({
        where: { id: { in: batch } }
      });

      deleted += batch.length;
      console.log(`   ✅ Deleted ${deleted}/${oldDocIds.length} products...`);
    }

    console.log(`\n✅ Cleanup complete!\n`);
    console.log(`📊 Summary:`);
    console.log(`   Total RAG products: ${ragProducts.length}`);
    console.log(`   Valid products: ${ragProducts.length - oldRagProducts.length}`);
    console.log(`   Deleted old products: ${deleted}`);

    return {
      success: true,
      deleted,
      total: ragProducts.length,
      remaining: ragProducts.length - deleted
    };

  } catch (error) {
    console.error("\n💥 Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI runner
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: { dryRun?: boolean } = {};

  if (args.includes("--dry-run")) {
    options.dryRun = true;
  } else if (args.includes("--help")) {
    console.log(`
Usage: npx tsx scripts/cleanup-old-rag-products.ts [options]

This script deletes RAG product documents that don't exist in Product table.

Options:
  --dry-run    Preview without actually deleting
  --help       Show this help message

Examples:
  npx tsx scripts/cleanup-old-rag-products.ts --dry-run
  npx tsx scripts/cleanup-old-rag-products.ts
    `);
    process.exit(0);
  }

  cleanupOldRagProducts(options)
    .then((result) => {
      console.log("\n✅ Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

export { cleanupOldRagProducts };
