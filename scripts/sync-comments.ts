import * as dotenv from 'dotenv';
import { listRecentChannelComments } from '../lib/youtube';
import { prisma } from '../lib/db';

dotenv.config();

async function syncComments() {
  console.log('🔄 Starting YouTube comments sync...\n');

  const daysBack = 7;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  let pageToken: string | undefined;
  let synced = 0;
  let page = 0;
  let reachedCutoff = false;

  while (true) {
    page++;
    console.log(`📄 Fetching page ${page}...`);

    const { comments, nextPageToken } = await listRecentChannelComments({
      daysBack,
      pageToken
    });

    console.log(`   Found ${comments.length} comments`);

    for (const comment of comments) {
      const publishedAt = new Date(comment.publishedAt);

      if (publishedAt < cutoff) {
        console.log(`   ⏹️  Reached cutoff date, stopping`);
        reachedCutoff = true;
        break;
      }

      await prisma.comment.upsert({
        where: { commentId: comment.commentId },
        create: {
          commentId: comment.commentId,
          textOriginal: comment.textOriginal,
          updatedAt: comment.updatedAt,
          authorDisplayName: comment.authorDisplayName,
          authorProfileImageUrl: comment.authorProfileImageUrl,
          authorChannelId: comment.authorChannelId,
          videoId: comment.videoId,
          canReply: comment.canReply,
          totalReplyCount: comment.totalReplyCount,
          publishedAt: comment.publishedAt
        },
        update: {
          textOriginal: comment.textOriginal,
          updatedAt: comment.updatedAt,
          authorDisplayName: comment.authorDisplayName,
          authorProfileImageUrl: comment.authorProfileImageUrl,
          authorChannelId: comment.authorChannelId,
          videoId: comment.videoId,
          canReply: comment.canReply,
          totalReplyCount: comment.totalReplyCount,
          publishedAt: comment.publishedAt
        }
      });

      synced++;
    }

    if (!nextPageToken || reachedCutoff) {
      break;
    }

    pageToken = nextPageToken;
  }

  console.log(`\n✅ Sync complete! Synced ${synced} comments`);
}

syncComments()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
