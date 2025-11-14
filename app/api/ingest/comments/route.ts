import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ingestComment, ingestComments } from "@/lib/rag/ingest";
import { CommentSourceSchema } from "@/lib/rag/schema";
import { z } from "zod";

const RequestSchema = z.object({
  comments: z.union([
    CommentSourceSchema,
    z.array(CommentSourceSchema),
  ]),
  overwrite: z.boolean().optional().default(false),
});

/**
 * POST /api/ingest/comments
 * Ingest comment(s) into RAG system
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validated = RequestSchema.parse(body);

    const { comments, overwrite } = validated;

    // Handle single comment
    if (!Array.isArray(comments)) {
      const result = await ingestComment(comments, overwrite);

      return NextResponse.json({
        success: true,
        documentsCreated: 1,
        chunksCreated: result.chunksCreated,
      });
    }

    // Handle multiple comments
    const result = await ingestComments(comments, overwrite);

    return NextResponse.json({
      success: result.failed === 0,
      documentsCreated: result.successful,
      chunksCreated: result.successful, // Comments are typically 1 chunk each
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("[api] /ingest/comments error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to ingest comments",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ingest/comments
 * Get ingestion status for comments
 */
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");

    if (!commentId) {
      return NextResponse.json(
        { error: "commentId parameter is required" },
        { status: 400 }
      );
    }

    // Check if comment is indexed
    const { getChunksBySource } = await import("@/lib/rag/retriever");
    const chunks = await getChunksBySource("comment", commentId);

    return NextResponse.json({
      indexed: chunks.length > 0,
      chunks: chunks.length,
      data: chunks.length > 0 ? chunks : undefined,
    });
  } catch (error) {
    console.error("[api] /ingest/comments GET error:", error);

    return NextResponse.json(
      {
        error: "Failed to get comment status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ingest/comments
 * Delete comment from RAG system
 */
export async function DELETE(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");

    if (!commentId) {
      return NextResponse.json(
        { error: "commentId parameter is required" },
        { status: 400 }
      );
    }

    // Delete comment
    const { deleteDocument } = await import("@/lib/rag/retriever");
    const deleted = await deleteDocument("comment", commentId);

    return NextResponse.json({
      success: deleted,
      message: deleted
        ? "Comment deleted successfully"
        : "Comment not found",
    });
  } catch (error) {
    console.error("[api] /ingest/comments DELETE error:", error);

    return NextResponse.json(
      {
        error: "Failed to delete comment",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
