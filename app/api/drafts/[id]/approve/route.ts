import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser } from "@/lib/permissions";
import { enqueueJob } from "@/lib/queue";
import type { AppSession } from "@/lib/permissions";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerAuthSession() as AppSession | null;
  assert(isAllowedUser, session, "Forbidden");

  const draft = await prisma.draft.update({
    where: { id: params.id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: session!.user.id
    }
  });

  enqueueJob({
    id: `post-${draft.id}`,
    type: "post-reply",
    payload: { draftId: draft.id, userId: session!.user.id }
  });

  return NextResponse.json({ ok: true });
}
