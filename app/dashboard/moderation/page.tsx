import { prisma } from "@/lib/db";
import CommentTable from "./CommentTable.client";

export default async function ModerationPage() {
  const comments = await prisma.comment.findMany({
    include: {
      draft: true
    },
    orderBy: { publishedAt: "desc" },
    take: 50
  });

  return <CommentTable comments={comments} />;
}
