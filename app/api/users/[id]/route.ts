import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAdmin, type AppSession } from "@/lib/permissions";

const updateSchema = z.object({
  role: z.enum(["ADMIN", "USER"]).optional(),
  allowed: z.boolean().optional()
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerAuthSession() as AppSession | null;
  assert(isAdmin, session, "Forbidden");

  const body = await request.json();
  const input = updateSchema.parse(body);

  const user = await prisma.user.update({
    where: { id: params.id },
    data: input
  });

  return NextResponse.json(user);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerAuthSession() as AppSession | null;
  assert(isAdmin, session, "Forbidden");

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
