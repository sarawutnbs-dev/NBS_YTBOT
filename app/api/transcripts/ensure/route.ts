import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { ensureVideoIndex } from "@/lib/videoIndexService";

const bodySchema = z.object({
  videoId: z.string().min(1, "videoId is required"),
});

export async function POST(request: Request) {
  try {
    const session = (await getServerAuthSession()) as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    const body = await request.json();
    const { videoId } = bodySchema.parse(body);

    const result = await ensureVideoIndex(videoId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/transcripts/ensure] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to ensure video index";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
