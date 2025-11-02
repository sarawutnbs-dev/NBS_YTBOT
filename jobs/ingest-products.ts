/**
 * Job: Ingest Products into RAG
 *
 * Fetches affiliate products and ingests them into the RAG system.
 * Can be run manually or scheduled via cron/queue system.
 */

import { PrismaClient } from "@prisma/client";
import { ingestProducts } from "@/lib/rag/ingest";
import { ProductSource } from "@/lib/rag/schema";

const prisma = new PrismaClient();

interface IngestProductsOptions {
  productId?: string; // Ingest specific product
  limit?: number; // Limit number of products to ingest
  overwrite?: boolean; // Overwrite existing indexed products
  category?: string; // Only ingest products from specific category
  tags?: string[]; // Only ingest products with specific tags
  dryRun?: boolean; // Preview without actually ingesting
}

/**
 * Main job function
 */
export async function ingestProductsJob(options: IngestProductsOptions = {}) {
  const {
    productId,
    limit,
    overwrite = false,
    category,
    tags,
    dryRun = false,
  } = options;

  console.log("[job:ingest-products] Starting...");
  console.log("[job:ingest-products] Options:", options);

  try {
    // Build where clause
    const conditions: string[] = [];

    if (productId) {
      conditions.push(`p."id" = '${productId}'`);
    }

    if (category) {
      conditions.push(`p."category" = '${category}'`);
    }

    if (tags && tags.length > 0) {
      // PostgreSQL array overlap operator
      const tagsArray = `ARRAY[${tags.map(t => `'${t}'`).join(',')}]`;
      conditions.push(`p."tags" && ${tagsArray}::text[]`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    // Fetch products from database
    // Note: Adjust the query based on your actual Product/AffiliateProduct model
    const products = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        p."id" as "productId",
        p."name",
        p."description",
        p."price",
        p."url",
        p."imageUrl",
        p."category",
        p."tags"
      FROM "Product" p
      ${whereClause}
      ORDER BY p."createdAt" DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `);

    if (products.length === 0) {
      console.log("[job:ingest-products] No products found to ingest");
      return {
        success: true,
        processed: 0,
        successful: 0,
        failed: 0,
      };
    }

    console.log(`[job:ingest-products] Found ${products.length} products to ingest`);

    if (dryRun) {
      console.log("[job:ingest-products] DRY RUN - No actual ingestion");
      console.log("[job:ingest-products] Sample products:", products.slice(0, 3).map(p => ({
        productId: p.productId,
        name: p.name,
        category: p.category,
        descriptionLength: p.description?.length,
      })));
      return {
        success: true,
        processed: 0,
        successful: 0,
        failed: 0,
        dryRun: true,
        previewCount: products.length,
      };
    }

    // Convert to ProductSource format
    const productSources: ProductSource[] = products.map((p) => ({
      productId: p.productId,
      name: p.name,
      description: p.description || undefined,
      price: p.price ? parseFloat(p.price) : undefined,
      url: p.url || undefined,
      imageUrl: p.imageUrl || undefined,
      category: p.category || undefined,
      tags: p.tags || undefined,
    }));

    // Ingest in batches of 20
    const batchSize = 20;
    let totalSuccessful = 0;
    let totalFailed = 0;

    for (let i = 0; i < productSources.length; i += batchSize) {
      const batch = productSources.slice(i, i + batchSize);

      console.log(
        `[job:ingest-products] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(productSources.length / batchSize)}`
      );

      const result = await ingestProducts(batch, overwrite);

      totalSuccessful += result.successful;
      totalFailed += result.failed;

      if (result.errors.length > 0) {
        console.error(
          `[job:ingest-products] Batch errors:`,
          result.errors.slice(0, 5)
        );
      }

      // Delay between batches
      if (i + batchSize < productSources.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    console.log(`[job:ingest-products] Completed: ${totalSuccessful} successful, ${totalFailed} failed`);

    return {
      success: totalFailed === 0,
      processed: products.length,
      successful: totalSuccessful,
      failed: totalFailed,
    };
  } catch (error) {
    console.error("[job:ingest-products] Error:", error);
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
  const options: IngestProductsOptions = {};

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--product-id" && args[i + 1]) {
      options.productId = args[i + 1];
      i++;
    } else if (arg === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else if (arg === "--category" && args[i + 1]) {
      options.category = args[i + 1];
      i++;
    } else if (arg === "--tags" && args[i + 1]) {
      options.tags = args[i + 1].split(",");
      i++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help") {
      console.log(`
Usage: npx tsx jobs/ingest-products.ts [options]

Options:
  --product-id <id>      Only ingest specific product
  --limit <number>       Limit number of products to ingest
  --overwrite            Overwrite existing indexed products
  --category <name>      Only ingest products from specific category
  --tags <tag1,tag2,...> Only ingest products with specific tags (comma-separated)
  --dry-run              Preview without actually ingesting
  --help                 Show this help message

Examples:
  npx tsx jobs/ingest-products.ts --product-id prod123
  npx tsx jobs/ingest-products.ts --limit 50 --category electronics
  npx tsx jobs/ingest-products.ts --tags "bestseller,featured"
  npx tsx jobs/ingest-products.ts --dry-run
      `);
      process.exit(0);
    }
  }

  ingestProductsJob(options)
    .then((result) => {
      console.log("[job:ingest-products] Result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("[job:ingest-products] Fatal error:", error);
      process.exit(1);
    });
}
