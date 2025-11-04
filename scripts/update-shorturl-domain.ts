/**
 * Update ShortURL Domain Script
 *
 * Replace all shortURL values from http://localhost:8080 to https://nbsi.me
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateShortUrlDomain() {
  console.log('========================================');
  console.log('Update ShortURL Domain');
  console.log('========================================');
  console.log('From: http://localhost:8080');
  console.log('To:   https://nbsi.me');
  console.log('');

  try {
    // 1. Count products with localhost URLs
    const count = await prisma.product.count({
      where: {
        shortURL: {
          startsWith: 'http://localhost:8080'
        }
      }
    });

    console.log(`📊 Found ${count} products to update\n`);

    if (count === 0) {
      console.log('✓ No products to update. All done!');
      return;
    }

    // 2. Fetch all products with localhost URLs
    const products = await prisma.product.findMany({
      where: {
        shortURL: {
          startsWith: 'http://localhost:8080'
        }
      },
      select: {
        id: true,
        shortURL: true
      }
    });

    console.log('📦 Updating products...\n');

    // 3. Update each product
    let updated = 0;
    for (const product of products) {
      if (!product.shortURL) continue;

      const newUrl = product.shortURL.replace('http://localhost:8080', 'https://nbsi.me');

      await prisma.product.update({
        where: { id: product.id },
        data: { shortURL: newUrl }
      });

      updated++;

      if (updated % 100 === 0) {
        console.log(`  ✓ Updated ${updated}/${count} products...`);
      }
    }

    console.log(`\n✓ Successfully updated ${updated} products`);
    console.log('========================================');

  } catch (error) {
    console.error('\n========================================');
    console.error('✗ Update Failed');
    console.error('========================================');
    console.error(error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updateShortUrlDomain()
  .then(() => {
    console.log('\n✓ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Script failed:', error);
    process.exit(1);
  });
