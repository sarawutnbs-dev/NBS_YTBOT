import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  try {
    const session = (await getServerAuthSession()) as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    const { commentId } = await request.json();

    if (!commentId) {
      return NextResponse.json({ error: "Comment ID is required" }, { status: 400 });
    }

    // Get comment with video info
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        draft: true,
      },
    });

    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // Check if video has transcript
    const videoIndex = await prisma.videoIndex.findUnique({
      where: { videoId: comment.videoId },
      select: { status: true },
    });

    if (!videoIndex || videoIndex.status !== "READY") {
      return NextResponse.json(
        { error: "Video does not have a transcript ready" },
        { status: 400 }
      );
    }

    // Delete existing draft if exists
    if (comment.draft) {
      await prisma.draft.delete({
        where: { id: comment.draft.id },
      });
    }

    // Trigger regeneration by calling the generate-video endpoint
    // This will create a new draft for this comment
    // Use localhost for internal API calls to avoid SSL issues in Docker
    const baseUrl = process.env.NODE_ENV === "production"
      ? "http://localhost:3000"
      : request.nextUrl.origin;

    const generateResponse = await fetch(
      `${baseUrl}/api/drafts/generate-video`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify({ videoId: comment.videoId }),
      }
    );

    if (!generateResponse.ok) {
      const error = await generateResponse.json();
      return NextResponse.json(
        { error: error.error || "Failed to regenerate draft" },
        { status: generateResponse.status }
      );
    }

    return NextResponse.json({
      message: "Draft regenerated successfully",
    });
  } catch (error) {
    console.error("[POST /api/drafts/regenerate-single] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to regenerate draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
