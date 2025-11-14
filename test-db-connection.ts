import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

async function testConnection() {
  console.log('Testing database connection...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL);

  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

  try {
    const count = await prisma.product.count({
      where: {
        shopeeProductId: { not: null },
        productLink: { not: null },
        shortURL: null
      }
    });

    console.log('✓ Connection successful!');
    console.log(`✓ Found ${count} products needing shortURLs`);
  } catch (error) {
    console.error('✗ Connection failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
