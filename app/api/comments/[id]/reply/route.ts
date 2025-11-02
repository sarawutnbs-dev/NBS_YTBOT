import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { replyToComment } from "@/lib/youtubeWrite";

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

    console.log("[API] 📤 Posting reply to YouTube...");
    console.log("   User ID:", session.user.id);
    console.log("   Comment ID:", comment.commentId);
    console.log("   Reply:", comment.draft.reply.substring(0, 50) + "...");

    // Use the YouTube API helper which handles token refresh automatically
    const response = await replyToComment({
      userId: session.user.id,
      parentId: comment.commentId,
      text: comment.draft.reply
    });

    console.log("[API] ✅ Reply posted to YouTube:", response.id);

    return NextResponse.json({
      success: true,
      message: "Reply posted successfully",
      youtubeReplyId: response.id,
    });
  } catch (error: any) {
    console.error("[API] ❌ Error posting reply:");
    console.error("Error type:", error?.constructor?.name);
    console.error("Error message:", error?.message);
    console.error("Error response:", error?.response?.data);
    console.error("Full error:", JSON.stringify(error, null, 2));

    // Check if it's a missing credentials error
    if (error?.message?.includes("Missing YouTube OAuth credentials")) {
      return NextResponse.json({
        error: "YouTube authentication required. Please logout and login again to grant YouTube permissions.",
        needsReauth: true
      }, { status: 401 });
    }

    const message =
      error instanceof Error ? error.message : "Failed to post reply";

    return NextResponse.json({
      error: message,
      details: error?.response?.data || error?.message || "Unknown error"
    }, { status: 500 });
  }
}
