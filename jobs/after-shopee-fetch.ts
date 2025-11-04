/**
 * Orchestrator: Run full shortLink sync after Shopee product fetch completes
 *
 * Usage: Run this script right after your Shopee fetch/import job finishes.
 * It will run the same full sync as `npm run shortlink:sync`, honoring env vars.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { syncShortLinks } from './sync-shortlinks';

async function main() {
  console.log('>>> Post-Shopee fetch: starting shortLink full sync');
  await syncShortLinks();
  console.log('>>> Post-Shopee fetch: shortLink full sync completed');
}

main().catch((err) => {
  console.error('Post-Shopee fetch sync failed:', err);
  process.exit(1);
});
