import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { generateDraft } from "@/lib/ai";

const requestSchema = z.object({
  commentId: z.string()
});

export async function POST(request: Request) {
  const session = await getServerAuthSession() as AppSession | null;
  assert(isAllowedUser, session, "Forbidden");

  const body = await request.json();
  const input = requestSchema.parse(body);

  const comment = await prisma.comment.findUnique({
    where: { id: input.commentId },
    include: { draft: true }
  });

  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const products = await prisma.product.findMany();
  const aiDraft = await generateDraft({
    comment: comment.textOriginal,
  products: products.map((product: (typeof products)[number]) => ({
      id: product.id,
      name: product.name,
      affiliateUrl: product.affiliateUrl
    }))
  });

  const draft = await prisma.draft.upsert({
    where: { commentId: comment.id },
    update: {
      reply: aiDraft.reply,
      status: "PENDING",
      suggestedProducts: JSON.stringify(aiDraft.products),
      engagementScore: aiDraft.scores.engagement,
      relevanceScore: aiDraft.scores.relevance
    },
    create: {
      commentId: comment.id,
      reply: aiDraft.reply,
      status: "PENDING",
      createdById: session.user.id,
      suggestedProducts: JSON.stringify(aiDraft.products),
      engagementScore: aiDraft.scores.engagement,
      relevanceScore: aiDraft.scores.relevance
    }
  });

  return NextResponse.json(draft);
}
