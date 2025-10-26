import { prisma } from "@/lib/db";
import { generateDraft } from "@/lib/ai";

export async function generateDraftsBatch(limit = 10) {
  const comments = await prisma.comment.findMany({
    where: {
      draft: null
    },
    orderBy: { publishedAt: "desc" },
    take: limit
  });

  const products = await prisma.product.findMany();

  for (const comment of comments) {
    const aiDraft = await generateDraft({
      comment: comment.textOriginal,
      products: products.map((product: (typeof products)[number]) => ({
        id: product.id,
        name: product.name,
        affiliateUrl: product.affiliateUrl
      }))
    });

    await prisma.draft.upsert({
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
        suggestedProducts: JSON.stringify(aiDraft.products),
        engagementScore: aiDraft.scores.engagement,
        relevanceScore: aiDraft.scores.relevance
      }
    });
  }
}
