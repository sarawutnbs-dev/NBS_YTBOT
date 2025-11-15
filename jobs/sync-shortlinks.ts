/**
 * Sync ShortLinks Job
 *
 * This script syncs product links with the shortLink service:
 * 1. Fetches products from DB in batches of 1000
 * 2. Transforms productLink to affiliate redirect format
 * 3. Sends to shortLink service for URL shortening
 * 4. Waits 5 minutes for processing
 * 5. Fetches results and updates products with shortURL
 */

import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Configuration (override via env)
const BATCH_SIZE = Number(process.env.SHORTLINK_BATCH_SIZE || 1000);
// Allow overriding delay via minutes or seconds (seconds win if provided)
const delaySecondsEnv = process.env.SHORTLINK_DELAY_SECONDS;
const delayMinutesEnv = process.env.SHORTLINK_DELAY_MINUTES;
const DELAY_MINUTES = delaySecondsEnv != null
  ? Number(delaySecondsEnv) / 60
  : Number(delayMinutesEnv || 5);
// Use internal Docker network URL by default for better security
const SHORTLINK_API_URL = process.env.SHORTLINK_API_URL || 'http://shortlink-app:8080';
const SHORTLINK_API_KEY = process.env.SHORTLINK_API_KEY;
const AFFILIATE_ID = process.env.SHORTLINK_AFFILIATE_ID || '15175090000';
const DRY_RUN = (process.env.SHORTLINK_DRY_RUN || '').toLowerCase() === 'true';

interface ProductToShorten {
  shopeeProductId: string;
  productLink: string;
}

interface ShortenItem {
  product_id: string;
  url: string;
}

/**
 * Transform productLink to affiliate redirect URL
 */
function transformToAffiliateUrl(productLink: string): string {
  // Ensure origin_link is URL-encoded and avoid duplicate query glue
  const encodedOrigin = encodeURIComponent(productLink);
  return `https://s.shopee.co.th/an_redir?origin_link=${encodedOrigin}&affiliate_id=${AFFILIATE_ID}`;
}

/**
 * Delay execution for specified minutes
 */
function delay(minutes: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, minutes * 60 * 1000));
}

/**
 * Send batch of products to shortLink service
 */
async function sendBatchToShortLink(products: ProductToShorten[]): Promise<number> {
  const items: ShortenItem[] = products.map(p => ({
    product_id: p.shopeeProductId,
    url: transformToAffiliateUrl(p.productLink)
  }));

  try {
    if (DRY_RUN) {
      console.log(`(DRY RUN) Would send ${items.length} products to shortLink service`);
      if (items.length > 0) {
        console.log(`(DRY RUN) Example payload:`, items.slice(0, 3));
      }
      return items.length;
    }

    // Prepare headers with API key authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (SHORTLINK_API_KEY) {
      headers['Authorization'] = `Bearer ${SHORTLINK_API_KEY}`;
    }

    const response = await axios.post(
      `${SHORTLINK_API_URL}/api/shorten`,
      { items },
      { headers }
    );

    console.log(`✓ Sent ${items.length} products to shortLink service`);
    console.log(`  Response:`, response.data);

    return response.data.queued || 0;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`✗ Failed to send batch:`, error.response?.data || error.message);
    } else {
      console.error(`✗ Unexpected error:`, error);
    }
    throw error;
  }
}

/**
 * Fetch shortURLs from shortLink service
 */
async function fetchShortUrls(productIds: string[]): Promise<Record<string, string>> {
  try {
    if (DRY_RUN) {
      console.log(`(DRY RUN) Would fetch short URLs for ${productIds.length} products`);
      return {};
    }

    // Prepare headers with API key authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (SHORTLINK_API_KEY) {
      headers['Authorization'] = `Bearer ${SHORTLINK_API_KEY}`;
    }

    const response = await axios.post(
      `${SHORTLINK_API_URL}/api/batch-stats`,
      { product_ids: productIds },
      { headers }
    );

    console.log(`✓ Fetched ${Object.keys(response.data).length} shortURLs from service`);

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`✗ Failed to fetch batch stats:`, error.response?.data || error.message);
    } else {
      console.error(`✗ Unexpected error:`, error);
    }
    throw error;
  }
}

/**
 * Update products with shortURLs
 */
async function updateProductsWithShortUrls(shortUrls: Record<string, string>): Promise<number> {
  let updated = 0;

  for (const [shopeeProductId, shortURL] of Object.entries(shortUrls)) {
    try {
      if (DRY_RUN) {
        console.log(`(DRY RUN) Would update product ${shopeeProductId} with shortURL=${shortURL}`);
        updated++;
        continue;
      }

      await prisma.product.update({
        where: { shopeeProductId },
        data: { shortURL }
      });
      updated++;
    } catch (error) {
      console.error(`✗ Failed to update product ${shopeeProductId}:`, error);
    }
  }

  console.log(`✓ Updated ${updated} products with shortURLs`);
  return updated;
}

/**
 * Main sync function
 */
export async function syncShortLinks() {
  console.log('========================================');
  console.log('Starting ShortLink Sync');
  console.log('========================================');
  console.log(`Config:`);
  console.log(`  - Batch Size: ${BATCH_SIZE}`);
  console.log(`  - Delay: ${DELAY_MINUTES} minutes (${(DELAY_MINUTES*60).toFixed(0)} seconds)`);
  console.log(`  - ShortLink API: ${SHORTLINK_API_URL}`);
  console.log(`  - API Authentication: ${SHORTLINK_API_KEY ? '✓ Enabled' : '✗ Disabled (INSECURE!)'}`);
  console.log(`  - Affiliate ID: ${AFFILIATE_ID}`);
  console.log(`  - Dry Run: ${DRY_RUN}`);
  console.log('');

  try {
    // 1. Get total count of products that need shortURLs
    const totalProducts = await prisma.product.count({
      where: {
        shopeeProductId: { not: null },
        productLink: { not: null },
        shortURL: null
      }
    });

    console.log(`📊 Found ${totalProducts} products to process\n`);

    if (totalProducts === 0) {
      console.log('✓ No products to process. All done!');
      return;
    }

    // 2. Process in batches
    let processedCount = 0;
    let batchNumber = 1;

    while (processedCount < totalProducts) {
      console.log(`\n--- Batch ${batchNumber} ---`);

      // Fetch batch of products
      const products = await prisma.product.findMany({
        where: {
          shopeeProductId: { not: null },
          productLink: { not: null },
          shortURL: null
        },
        select: {
          shopeeProductId: true,
          productLink: true
        },
        take: BATCH_SIZE
      });

      if (products.length === 0) {
        console.log('No more products to process');
        break;
      }

      // Filter out invalid products
      const validProducts = products.filter(
        p => p.shopeeProductId && p.productLink
      ) as ProductToShorten[];

      console.log(`📦 Processing ${validProducts.length} products...`);

      // Send to shortLink service
      const queued = await sendBatchToShortLink(validProducts);

      if (!DRY_RUN) {
        console.log(`⏳ Waiting ${DELAY_MINUTES} minutes for processing...`);
        await delay(DELAY_MINUTES);
      } else {
        console.log(`(DRY RUN) Skipping wait of ${DELAY_MINUTES} minutes`);
      }

      // Fetch results
      const productIds = validProducts.map(p => p.shopeeProductId);
      const shortUrls = await fetchShortUrls(productIds);

      // Update database
      const updated = await updateProductsWithShortUrls(shortUrls);

      processedCount += validProducts.length;
      batchNumber++;

      console.log(`\n✓ Batch ${batchNumber - 1} complete: ${updated}/${validProducts.length} updated`);
      console.log(`📈 Progress: ${processedCount}/${totalProducts} (${Math.round(processedCount / totalProducts * 100)}%)`);
    }

    console.log('\n========================================');
    console.log('✓ ShortLink Sync Complete!');
    console.log(`📊 Total processed: ${processedCount} products`);
    console.log('========================================');

  } catch (error) {
    console.error('\n========================================');
    console.error('✗ ShortLink Sync Failed');
    console.error('========================================');
    console.error(error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Allow running as a standalone CLI
if (require.main === module) {
  syncShortLinks()
    .then(() => {
      console.log('\n✓ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Script failed:', error);
      process.exit(1);
    });
}
