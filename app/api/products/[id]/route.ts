import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser } from "@/lib/permissions";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  affiliateUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional()
});

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerAuthSession();
  assert(isAllowedUser, session, "Forbidden");

  const body = await request.json();
  const input = updateSchema.parse(body);

  const data: Record<string, unknown> = {};
  if (typeof input.name === "string") {
    data.name = input.name;
  }
  if (typeof input.affiliateUrl === "string") {
    data.affiliateUrl = input.affiliateUrl;
  }
  if (Array.isArray(input.tags)) {
    data.tagsJson = JSON.stringify(input.tags);
  }

  const product = await prisma.product.update({
    where: { id: params.id },
    data
  });

  return NextResponse.json({
    ...product,
    tags: Array.isArray(input.tags) ? input.tags : product.tagsJson ? JSON.parse(product.tagsJson) : []
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerAuthSession();
  assert(isAllowedUser, session, "Forbidden");

  await prisma.product.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
