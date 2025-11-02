import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { google } from "googleapis";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerAuthSession() as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get comment with draft
    const comment = await prisma.comment.findUnique({
      where: { id: params.id },
      include: { draft: true },
    });

    if (!comment) {
      return NextResponse.json(
        { error: "Comment not found" },
        { status: 404 }
      );
    }

    if (!comment.draft) {
      return NextResponse.json(
        { error: "No draft available for this comment" },
        { status: 400 }
      );
    }

    if (!comment.draft.reply) {
      return NextResponse.json(
        { error: "Draft has no reply text" },
        { status: 400 }
      );
    }

    // Check OAuth tokens
    if (!session.user.accessToken || !session.user.refreshToken) {
      return NextResponse.json(
        { error: "YouTube authentication required" },
        { status: 401 }
      );
    }

    // Initialize YouTube API client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + "/api/auth/callback/google"
    );

    oauth2Client.setCredentials({
      access_token: session.user.accessToken,
      refresh_token: session.user.refreshToken,
    });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // Post reply to YouTube
    const response = await youtube.comments.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          parentId: comment.commentId,
          textOriginal: comment.draft.reply,
        },
      },
    });

    console.log("[API] ✅ Reply posted to YouTube:", response.data.id);

    return NextResponse.json({
      success: true,
      message: "Reply posted successfully",
      youtubeReplyId: response.data.id,
    });
  } catch (error) {
    console.error("[API] ❌ Error posting reply:", error);

    const message =
      error instanceof Error ? error.message : "Failed to post reply";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
