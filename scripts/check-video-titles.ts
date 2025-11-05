import { prisma } from "../lib/db";

async function checkVideoTitles() {
  try {
    // Get all video IDs from comments
    const comments = await prisma.comment.findMany({
      select: {
        videoId: true,
      },
      distinct: ['videoId'],
    });

    console.log(`Found ${comments.length} unique video IDs in comments\n`);

    // Check each video in videoIndex
    for (const comment of comments) {
      const videoIndex = await prisma.videoIndex.findUnique({
        where: { videoId: comment.videoId },
        select: {
          videoId: true,
          title: true,
          publishedAt: true,
          status: true,
        },
      });

      if (videoIndex) {
        console.log(`✓ ${comment.videoId}`);
        console.log(`  Title: ${videoIndex.title || '(empty)'}`);
        console.log(`  Status: ${videoIndex.status}`);
        console.log(`  Published: ${videoIndex.publishedAt || '(unknown)'}\n`);
      } else {
        console.log(`✗ ${comment.videoId} - NOT FOUND IN VIDEO INDEX\n`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkVideoTitles();
