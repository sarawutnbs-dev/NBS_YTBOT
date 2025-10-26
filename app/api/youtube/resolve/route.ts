import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser } from "@/lib/permissions";
import { resolveCommentThread } from "@/lib/youtube";

const requestSchema = z.object({ id: z.string() });

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  assert(isAllowedUser, session, "Forbidden");

  const body = await request.json();
  const input = requestSchema.parse(body);

  const data = await resolveCommentThread(input.id);
  return NextResponse.json(data);
}
