import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAdmin } from "@/lib/permissions";

const createUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "USER"]).default("USER")
});

export async function GET() {
  const session = await getServerAuthSession();
  assert(isAdmin, session, "Forbidden");

  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  assert(isAdmin, session, "Forbidden");

  const body = await request.json();
  const input = createUserSchema.parse(body);

  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: { role: input.role, allowed: true },
    create: { email: input.email, role: input.role }
  });

  return NextResponse.json(user, { status: 201 });
}
