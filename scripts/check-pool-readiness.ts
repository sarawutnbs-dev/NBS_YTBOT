/**
 * Check if system is ready to create Video Product Pool
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ override: false });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkReadiness() {
  console.log('📊 Checking Pool Readiness...\n');

  try {
    // 1. Check Products
    const productCount = await prisma.product.count();
    const productsWithEmbeddings = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT d."sourceId") as count
      FROM "RagDocument" d
      JOIN "RagChunk" c ON d."docId" = c.id
      WHERE d."sourceType" = 'product'
        AND c.embedding IS NOT NULL
    `;

    // 2. Check VideoIndex
    const videoCount = await prisma.videoIndex.count({ where: { status: 'READY' } });
    const videosWithMetadata = await prisma.videoIndex.count({
      where: {
        status: 'READY',
        OR: [
          { categoryTags: { isEmpty: false } },
          { brandTags: { isEmpty: false } },
          {
            AND: [
              { priceRangeMin: { not: null } },
              { priceRangeMax: { not: null } }
            ]
          }
        ]
      }
    });

    // 3. Check VideoProductPool
    const poolCount = await prisma.videoProductPool.count();

    // 4. Sample videos with metadata
    const sampleVideos = await prisma.videoIndex.findMany({
      where: { status: 'READY' },
      take: 3,
      select: {
        videoId: true,
        title: true,
        categoryTags: true,
        brandTags: true,
        priceRangeMin: true,
        priceRangeMax: true,
        tags: true
      }
    });

    console.log('='.repeat(80));
    console.log('📦 Products:');
    console.log('  Total:', productCount);
    console.log('  With embeddings:', Number(productsWithEmbeddings[0]?.count || 0));
    console.log('');

    console.log('🎬 Videos:');
    console.log('  READY status:', videoCount);
    console.log('  With metadata:', videosWithMetadata);
    console.log('');

    console.log('🔗 VideoProductPool:');
    console.log('  Entries:', poolCount);
    console.log('');

    console.log('='.repeat(80));
    console.log('\n📋 Sample Videos:\n');

    sampleVideos.forEach((v, idx) => {
      console.log(`${idx + 1}. ${v.title.substring(0, 50)}...`);
      console.log(`   categoryTags: [${v.categoryTags.join(', ')}]`);
      console.log(`   brandTags: [${v.brandTags.join(', ')}]`);
      console.log(`   priceRange: ${v.priceRangeMin} - ${v.priceRangeMax}`);
      console.log(`   tags: [${v.tags.slice(0, 3).join(', ')}${v.tags.length > 3 ? '...' : ''}]`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('\n✅ Readiness Check:\n');

    const hasProducts = productCount > 0;
    const hasProductEmbeddings = Number(productsWithEmbeddings[0]?.count || 0) > 0;
    const hasVideos = videoCount > 0;
    const hasVideoMetadata = videosWithMetadata > 0;

    console.log(`${hasProducts ? '✅' : '❌'} Products exist (${productCount})`);
    console.log(`${hasProductEmbeddings ? '✅' : '❌'} Product embeddings exist (${productsWithEmbeddings[0]?.count || 0})`);
    console.log(`${hasVideos ? '✅' : '❌'} READY videos exist (${videoCount})`);
    console.log(`${hasVideoMetadata ? '✅' : '❌'} Videos with metadata (${videosWithMetadata})`);

    console.log('\n' + '='.repeat(80));

    if (!hasProducts || !hasProductEmbeddings) {
      console.log('\n⚠️  WARNING: Missing product embeddings!');
      console.log('   Run: npx tsx scripts/ingest-all-products.ts\n');
    }

    if (!hasVideoMetadata) {
      console.log('\n⚠️  WARNING: No videos have metadata!');
      console.log('   Run: npx tsx scripts/extract-video-metadata.ts\n');
    }

    if (hasProducts && hasProductEmbeddings && hasVideos && hasVideoMetadata) {
      console.log('\n🚀 READY! You can now run:');
      console.log('   npx tsx scripts/compute-video-pools.ts\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkReadiness();
