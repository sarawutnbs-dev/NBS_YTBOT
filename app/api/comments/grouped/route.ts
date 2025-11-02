import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";

export async function GET() {
  try {
    const session = (await getServerAuthSession()) as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    // Fetch all comments with drafts
    const comments = await prisma.comment.findMany({
      include: {
        draft: true
      },
      orderBy: {
        publishedAt: "desc"
      }
    });

    // Group comments by videoId
    const groupedMap = new Map<string, {
      videoId: string;
      videoTitle: string;
      videoPublishedAt: Date | null;
      latestCommentDate: Date;
      comments: typeof comments;
      hasTranscript: boolean;
    }>();

    for (const comment of comments) {
      const existing = groupedMap.get(comment.videoId);

      if (existing) {
        existing.comments.push(comment);
        // Update latest comment date if this comment is newer
        if (comment.publishedAt > existing.latestCommentDate) {
          existing.latestCommentDate = comment.publishedAt;
        }
      } else {
        groupedMap.set(comment.videoId, {
          videoId: comment.videoId,
          videoTitle: "", // Will be filled later
          videoPublishedAt: null,
          latestCommentDate: comment.publishedAt,
          comments: [comment],
          hasTranscript: false
        });
      }
    }

    // Fetch video information for all videos
    const videoIds = Array.from(groupedMap.keys());
    const videoIndexes = await prisma.videoIndex.findMany({
      where: {
        videoId: { in: videoIds }
      },
      select: {
        videoId: true,
        title: true,
        publishedAt: true,
        status: true
      }
    });

    // Update video info in groups
    for (const video of videoIndexes) {
      const group = groupedMap.get(video.videoId);
      if (group) {
        group.videoTitle = video.title || `Video ${video.videoId}`;
        group.videoPublishedAt = video.publishedAt;
        group.hasTranscript = video.status === "READY";
      }
    }

    // Fill in missing video titles
    for (const [videoId, group] of groupedMap.entries()) {
      if (!group.videoTitle) {
        group.videoTitle = `Video ${videoId}`;
      }
    }

    // Convert to array and sort by latest comment date
    const grouped = Array.from(groupedMap.values()).sort(
      (a, b) => b.latestCommentDate.getTime() - a.latestCommentDate.getTime()
    );

    return NextResponse.json(grouped);
  } catch (error) {
    console.error("[GET /api/comments/grouped] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch grouped comments";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
