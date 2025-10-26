import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser } from "@/lib/permissions";
import { listRecentChannelComments } from "@/lib/youtube";
import { appConfig } from "@/lib/config";

const requestSchema = z.object({
  daysBack: z.number().int().min(1).max(appConfig.sync.maxDays).optional()
});

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  assert(isAllowedUser, session, "Forbidden");

  const body = request.headers.get("content-length") ? await request.json() : {};
  const input = requestSchema.parse(body);

  const cutoffDays = input.daysBack ?? appConfig.sync.defaultDays;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cutoffDays);

  let pageToken: string | undefined;
  let synced = 0;
  let stop = false;

  try {
    while (!stop) {
      const { comments, nextPageToken } = await listRecentChannelComments({
        daysBack: cutoffDays,
        pageToken
      });

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

    return NextResponse.json({ synced });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync comments from YouTube";

    return NextResponse.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}
