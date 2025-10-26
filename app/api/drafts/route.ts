import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser } from "@/lib/permissions";

const createDraftSchema = z.object({
  commentId: z.string(),
  reply: z.string().min(1),
  products: z.array(z.string()).default([])
});

export async function GET() {
  const session = await getServerAuthSession();
  assert(isAllowedUser, session, "Forbidden");

  const drafts = await prisma.draft.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      comment: true,
      products: true
    }
  });

  return NextResponse.json(drafts);
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  assert(isAllowedUser, session, "Forbidden");

  const body = await request.json();
  const input = createDraftSchema.parse(body);

  const draft = await prisma.draft.create({
    data: {
      commentId: input.commentId,
      reply: input.reply,
      status: "PENDING",
      createdById: session.user.id,
      products: {
        connect: input.products.map((id: string) => ({ id }))
      }
    }
  });

  return NextResponse.json(draft, { status: 201 });
}
