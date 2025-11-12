import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
  try {
    const counts = {
      users: await prisma.user.count(),
      products: await prisma.product.count(),
      shopeeCategories: await prisma.shopeeCategory.count(),
      comments: await prisma.comment.count(),
      drafts: await prisma.draft.count(),
      videoIndexes: await prisma.videoIndex.count(),
      videoProductPools: await prisma.videoProductPool.count(),
      ragDocuments: await prisma.ragDocument.count(),
      ragChunks: await prisma.ragChunk.count(),
      appSettings: await prisma.appSetting.count(),
    };

    console.log('\n📊 Database Record Counts:');
    console.log('─'.repeat(40));
    Object.entries(counts).forEach(([table, count]) => {
      const emoji = count === 0 ? '❌' : '✅';
      console.log(`${emoji} ${table.padEnd(20)}: ${count}`);
    });
    console.log('─'.repeat(40));

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`📈 Total records: ${total}\n`);
  } catch (error) {
    console.error('Error checking data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
