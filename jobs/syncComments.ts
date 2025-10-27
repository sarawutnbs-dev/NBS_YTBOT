import { listRecentChannelComments } from "@/lib/youtube";
import { prisma } from "@/lib/db";
import { appConfig } from "@/lib/config";
import { ensureVideoIndexFor } from "@/lib/transcriptQueue";

export async function syncComments(daysBack = appConfig.sync.defaultDays) {
  let pageToken: string | undefined;
  let synced = 0;
  let stop = false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  // ✅ เก็บเฉพาะวิดีโอที่ "มีคอมเมนต์ใหม่/อัปเดต" ในรอบนี้
  const affectedVideoIds = new Set<string>();

  while (!stop) {
    const { comments, nextPageToken } = await listRecentChannelComments({ daysBack, pageToken });

    for (const comment of comments) {
      const publishedAt = new Date(comment.publishedAt);
      if (publishedAt < cutoff) {
        stop = true;
        break;
      }

      // 🔎 เช็กว่า "อันนี้ใหม่หรืออัปเดต" จริงไหม ก่อน upsert
      const existing = await prisma.comment.findUnique({
        where: { commentId: comment.commentId },
        select: { updatedAt: true, videoId: true }
      });

      // เงื่อนไขเป็น "ใหม่" ถ้าไม่มี existing
      // หรือ "อัปเดต" ถ้า updatedAt ใหม่กว่าเดิม
      const isNewOrUpdated =
        !existing || (new Date(comment.updatedAt) > new Date(existing.updatedAt));

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

      if (isNewOrUpdated) {
        affectedVideoIds.add(comment.videoId);
      }

      synced += 1;
    }

    if (!nextPageToken || stop) {
      break;
    }

    pageToken = nextPageToken;
  }

  // ✅ หลังซิงก์เสร็จ ค่อย "สั่งทำ transcript" เฉพาะวิดีโอที่มีการเปลี่ยนแปลง
  if (affectedVideoIds.size > 0) {
    console.log(`[syncComments] Found ${affectedVideoIds.size} affected video(s), triggering transcript indexing`);
    await ensureVideoIndexFor(affectedVideoIds);
  }

  return { synced, affectedVideoIds: Array.from(affectedVideoIds) };
}
