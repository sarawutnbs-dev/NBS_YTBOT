import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { ensureVideoIndex } from "@/lib/videoIndexService";

const bodySchema = z.object({
  videoId: z.string().min(1, "videoId is required"),
  forceReindex: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    console.log("[POST /api/transcripts/ensure] Starting request");

    const session = (await getServerAuthSession()) as AppSession | null;
    console.log("[POST /api/transcripts/ensure] Session:", session ? "authenticated" : "not authenticated");
    assert(isAllowedUser, session, "Forbidden");

    const body = await request.json();
    console.log("[POST /api/transcripts/ensure] Body:", body);

    const { videoId, forceReindex } = bodySchema.parse(body);
    console.log("[POST /api/transcripts/ensure] Parsed:", { videoId, forceReindex });

    const result = await ensureVideoIndex(videoId, { forceReindex });
    console.log("[POST /api/transcripts/ensure] Result:", result);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/transcripts/ensure] Error:", error);
    console.error("[POST /api/transcripts/ensure] Error stack:", error instanceof Error ? error.stack : "N/A");
    const message = error instanceof Error ? error.message : "Failed to ensure video index";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
