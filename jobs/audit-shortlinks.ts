/**
 * Audit ShortLinks Job
 *
 * Prints counts of products missing shortURL and samples for quick inspection.
 */

import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditShortLinks() {
  console.log('========================================');
  console.log('ShortLink Audit');
  console.log('========================================');

  try {
    const missingShort = await prisma.product.count({ where: { shortURL: null } });
    const withShort = await prisma.product.count({ where: { shortURL: { not: null } } });
    const total = await prisma.product.count();

    const missingButEligible = await prisma.product.count({
      where: {
        shortURL: null,
        shopeeProductId: { not: null },
        productLink: { not: null }
      }
    });

    console.log(`Total products: ${total}`);
    console.log(`With shortURL: ${withShort}`);
    console.log(`Missing shortURL: ${missingShort}`);
    console.log(`Eligible to shorten (have shopeeProductId + productLink): ${missingButEligible}`);

    if (missingButEligible > 0) {
      const samples = await prisma.product.findMany({
        where: {
          shortURL: null,
          shopeeProductId: { not: null },
          productLink: { not: null }
        },
        select: {
          id: true,
          name: true,
          shopeeProductId: true,
          productLink: true
        },
        take: 5
      });

      console.log('\nExamples (first 5):');
      for (const s of samples) {
        console.log(`- ${s.name} | productId=${s.shopeeProductId} | link=${s.productLink}`);
      }
    }

    console.log('\nRecommendation: Run "npm run shortlink:sync" to generate and backfill short links.');
  } catch (error) {
    console.error('Audit failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

auditShortLinks();
