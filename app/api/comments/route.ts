import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = (await getServerAuthSession()) as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    const comments = await prisma.comment.findMany({
      include: {
        draft: true
      },
      orderBy: { publishedAt: "desc" },
      take: 50
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error("[GET /api/comments] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch comments";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
