import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { ensureMissing } from "@/lib/videoIndexService";

export async function POST() {
  try {
    const session = (await getServerAuthSession()) as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    const result = await ensureMissing();

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/transcripts/ensure-missing] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to ensure missing transcripts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
