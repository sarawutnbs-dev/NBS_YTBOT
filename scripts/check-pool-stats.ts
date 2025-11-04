import { prisma } from "@/lib/db";

async function checkStats() {
  const totalProducts = await prisma.product.count();
  console.log('Total products in database:', totalProducts);

  const poolCount = await prisma.videoProductPool.count({
    where: { videoId: 'TEST_VIDEO_001' }
  });
  console.log('Pool size for TEST_VIDEO_001:', poolCount);

  const productsWithEmbeddings = await prisma.ragDocument.count({
    where: { sourceType: 'product' }
  });
  console.log('Products with RAG embeddings:', productsWithEmbeddings);

  // Check if Option 1 (two-stage) vs Option 2 (pool) actually differ
  console.log('\n=== Performance Reality Check ===');
  console.log('With only', totalProducts, 'products:');
  console.log('- Option 1 (two-stage) filters from', totalProducts, '→ pool candidates → vector search');
  console.log('- Option 2 (pool) uses precomputed', poolCount, 'products → vector search');
  console.log('\nBoth options search the same', poolCount, 'products!');
  console.log('Real benefit only visible with 10,000+ products in database.');

  await prisma.$disconnect();
}

checkStats();
