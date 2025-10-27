import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { getPreview } from "@/lib/videoIndexService";

export async function GET(
  request: Request,
  { params }: { params: { videoId: string } }
) {
  try {
    const session = (await getServerAuthSession()) as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    const { videoId } = params;

    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    const preview = await getPreview(videoId);

    if (!preview) {
      return NextResponse.json({ error: "Video index not found" }, { status: 404 });
    }

    return NextResponse.json(preview);
  } catch (error) {
    console.error("[GET /api/transcripts/[videoId]/preview] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to get preview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
