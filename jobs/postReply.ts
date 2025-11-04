import { prisma } from "@/lib/db";
import { replyToComment } from "@/lib/youtubeWrite";

export async function postReply(draftId: string, userId: string) {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { comment: true }
  });

  if (!draft || !draft.comment) {
    throw new Error("Draft or comment not found");
  }

  const response = await replyToComment({
    userId,
    parentId: draft.comment.commentId,
    text: draft.reply
  });

  // Only update status to POSTED if the YouTube API response is successful
  if (!response || !response.id) {
    throw new Error("YouTube API did not return a valid response - reply may not have been posted");
  }

  await prisma.draft.update({
    where: { id: draft.id },
    data: {
      status: "POSTED",
      postedAt: new Date()
    }
  });

  return response;
}
