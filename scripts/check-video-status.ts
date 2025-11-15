import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://nbsytbot:nbsytbot123@localhost:5435/nbsytbot?schema=public'
    }
  }
});

async function main() {
  const videoId = 'iyR0Bb3Vjnk';

  const video = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      videoId: true,
      title: true,
      status: true,
      chunksJSON: true,
      summaryJSON: true,
      createdAt: true,
      updatedAt: true
    }
  });

  console.log('Current video status:');
  console.log(JSON.stringify(video, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
