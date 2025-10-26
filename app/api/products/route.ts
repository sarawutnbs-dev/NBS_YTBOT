import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";

const createProductSchema = z.object({
  name: z.string().min(1),
  affiliateUrl: z.string().url(),
  tags: z
    .string()
    .optional()
    .transform((value: string | undefined) =>
      value
        ?.split(",")
        .map((tag: string) => tag.trim())
        .filter(Boolean) ?? []
    )
    .or(z.array(z.string()).optional())
});

export async function GET() {
  const session = await getServerAuthSession() as AppSession | null;
  assert(isAllowedUser, session, "Forbidden");

  const products = await prisma.product.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(products);
}

export async function POST(request: Request) {
  const session = await getServerAuthSession() as AppSession | null;
  assert(isAllowedUser, session, "Forbidden");

  const body = await request.json();
  const input = createProductSchema.parse(body);

  const product = await prisma.product.create({
    data: {
      name: input.name,
      affiliateUrl: input.affiliateUrl,
      tags: Array.isArray(input.tags) ? input.tags : []
    }
  });

  return NextResponse.json(product, { status: 201 });
}
