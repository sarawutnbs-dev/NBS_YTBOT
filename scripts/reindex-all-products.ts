/**
 * Re-index ALL products from Product table into RAG system
 * This fixes the mismatch between RAG sourceIds and Product shopeeProductIds
 */

import { PrismaClient } from "@prisma/client";
import { ingestProduct } from "@/lib/rag/ingest";
import { ProductSource } from "@/lib/rag/schema";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ override: true });
dotenv.config({ override: false });

const prisma = new PrismaClient();

async function reindexAllProducts(options: {
  limit?: number;
  dryRun?: boolean;
  batchSize?: number;
} = {}) {
  const {
    limit,
    dryRun = false,
    batchSize = 50  // Process in batches
  } = options;

  console.log("🔄 Starting FULL product re-indexing...");
  console.log(`   Limit: ${limit || "ALL products"}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Dry run: ${dryRun}\n`);

  try {
    // 1. Count total products
    const totalProducts = await prisma.product.count({
      where: {
        inStock: true,
        hasAffiliate: true,
        shortURL: { not: null }
      }
    });

    console.log(`📦 Total products ready to index: ${totalProducts}\n`);

    if (totalProducts === 0) {
      console.log("⚠️  No products found with inStock=true, hasAffiliate=true, and shortURL");
      return {
        success: true,
        processed: 0,
        succeeded: 0,
        failed: 0
      };
    }

    // 2. Get products to process
    const productsQuery = {
      where: {
        inStock: true,
        hasAffiliate: true,
        shortURL: { not: null }
      },
      select: {
        id: true,
        shopeeProductId: true,
        name: true,
        price: true,
        shortURL: true,
        affiliateUrl: true,
        productLink: true,
        categoryName: true,
        tags: true,
      },
      take: limit || undefined,
    };

    const products = await prisma.product.findMany(productsQuery);

    console.log(`📥 Fetched ${products.length} products from database\n`);

    if (dryRun) {
      console.log("🔍 DRY RUN - Preview of products to re-index:\n");
      for (const product of products.slice(0, 10)) {
        console.log(`  • ${product.shopeeProductId} - ${product.name.substring(0, 60)}`);
        console.log(`    Price: ${product.price?.toLocaleString() || 'N/A'} ฿`);
        console.log(`    Tags: ${product.tags.length} tags\n`);
      }
      console.log(`\n...and ${products.length - 10} more products`);
      return {
        success: true,
        processed: 0,
        succeeded: 0,
        failed: 0,
        dryRun: true,
        previewCount: products.length,
      };
    }

    // 3. Process in batches
    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ shopeeProductId: string; error: string }> = [];

    console.log("🚀 Starting re-indexing...\n");

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(products.length / batchSize);

      console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} products)...`);

      const batchPromises = batch.map(async (product, idx) => {
        try {
          const url = product.shortURL || product.affiliateUrl || product.productLink || undefined;

          const productSource: ProductSource = {
            productId: product.shopeeProductId || product.id,
            name: product.name,
            description: undefined,
            price: product.price != null ? Number(product.price) : undefined,
            url,
            imageUrl: undefined,
            category: product.categoryName || undefined,
            tags: product.tags || [],
          };

          await ingestProduct(productSource, true); // overwrite = true

          succeeded++;

          const globalIdx = i + idx + 1;
          if (globalIdx % 10 === 0) {
            console.log(`   ✅ ${globalIdx}/${products.length} indexed...`);
          }
        } catch (error) {
          failed++;
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          errors.push({
            shopeeProductId: product.shopeeProductId || product.id,
            error: errorMsg,
          });
        }
      });

      // Wait for batch to complete
      await Promise.all(batchPromises);

      console.log(`   ✅ Batch ${batchNum} completed (${succeeded}/${products.length} total)\n`);

      // Small delay between batches
      if (i + batchSize < products.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 Re-indexing Summary:");
    console.log("=".repeat(60));
    console.log(`   Total processed: ${products.length}`);
    console.log(`   ✅ Succeeded: ${succeeded}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   Success rate: ${((succeeded / products.length) * 100).toFixed(1)}%`);

    if (errors.length > 0) {
      console.log("\n❌ Errors (first 10):");
      errors.slice(0, 10).forEach((err) => {
        console.log(`   • ${err.shopeeProductId}: ${err.error}`);
      });

      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
    }

    return {
      success: failed === 0,
      processed: products.length,
      succeeded,
      failed,
      errors,
    };
  } catch (error) {
    console.error("\n💥 Fatal error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * CLI runner
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: Parameters<typeof reindexAllProducts>[0] = {};

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if (arg === "--batch-size" && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1]);
      i++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help") {
      console.log(`
Usage: npx tsx scripts/reindex-all-products.ts [options]

This script re-indexes ALL products from Product table into RAG system.
Use this to fix mismatches between RAG sourceIds and Product shopeeProductIds.

Options:
  --limit <number>        Limit number of products to process (default: ALL)
  --batch-size <number>   Process in batches of N products (default: 50)
  --dry-run               Preview without actually indexing
  --help                  Show this help message

Examples:
  npx tsx scripts/reindex-all-products.ts --dry-run
  npx tsx scripts/reindex-all-products.ts --limit 100
  npx tsx scripts/reindex-all-products.ts --batch-size 100
  npx tsx scripts/reindex-all-products.ts
      `);
      process.exit(0);
    }
  }

  console.log("\n⚠️  WARNING: This will re-index ALL products in RAG system!");
  console.log("This may take several minutes depending on the number of products.\n");

  reindexAllProducts(options)
    .then((result) => {
      console.log("\n✅ Re-indexing completed!");
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

export { reindexAllProducts };
