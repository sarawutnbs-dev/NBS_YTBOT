import { listRecentChannelComments } from "@/lib/youtube";
import { prisma } from "@/lib/db";
import { appConfig } from "@/lib/config";

export async function syncComments(daysBack = appConfig.sync.defaultDays) {
  let pageToken: string | undefined;
  let synced = 0;
  let stop = false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  while (!stop) {
    const { comments, nextPageToken } = await listRecentChannelComments({ daysBack, pageToken });

    for (const comment of comments) {
      const publishedAt = new Date(comment.publishedAt);
      if (publishedAt < cutoff) {
        stop = true;
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

      synced += 1;
    }

    if (!nextPageToken || stop) {
      break;
    }

    pageToken = nextPageToken;
  }

  return synced;
}
