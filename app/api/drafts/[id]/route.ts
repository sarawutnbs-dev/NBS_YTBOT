import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser } from "@/lib/permissions";

const updateSchema = z.object({
  reply: z.string().min(1)
});

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerAuthSession();
  assert(isAllowedUser, session, "Forbidden");

  const body = await request.json();
  const input = updateSchema.parse(body);

  const draft = await prisma.draft.update({
    where: { id: params.id },
    data: {
      reply: input.reply,
      status: "PENDING"
    }
  });

  return NextResponse.json(draft);
}
