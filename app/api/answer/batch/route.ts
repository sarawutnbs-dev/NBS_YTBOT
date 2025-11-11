import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { generateBatchAnswers } from "@/lib/rag/answer";
import { BatchAnswerRequestSchema } from "@/lib/rag/schema";
import { z } from "zod";

/**
 * POST /api/answer/batch
 * Generate answers for multiple comments in batch (grouped by video)
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
    const validated = BatchAnswerRequestSchema.parse(body);

    const {
      videoId,
      commentIds,
      includeProducts = true,
      includeTranscripts = true,
      temperature = 0.7,
    } = validated;

    // Fetch comment texts (assuming you have a way to get comments)
    // For now, we'll accept the comments in the request
    // In a real implementation, you'd fetch from your database

    const commentsData = body.comments as Array<{ commentId: string; text: string }> | undefined;

    if (!commentsData || commentsData.length === 0) {
      return NextResponse.json(
        { error: "comments array with {commentId, text} is required" },
        { status: 400 }
      );
    }

    // Validate that all requested commentIds are present
    const providedIds = new Set(commentsData.map((c) => c.commentId));
    const missingIds = commentIds.filter((id) => !providedIds.has(id));

    if (missingIds.length > 0) {
      return NextResponse.json(
        {
          error: "Missing comment data for some IDs",
          missingIds,
        },
        { status: 400 }
      );
    }

    // Filter to only requested comments
    const requestedComments = commentsData.filter((c) =>
      commentIds.includes(c.commentId)
    );

    // Generate batch answers (now includes products in JSON format)
    const response = await generateBatchAnswers(
      videoId,
      requestedComments,
      {
        includeProducts,
        includeTranscripts,
        temperature,
      }
    );

    console.log(`[api] ✅ Generated ${response.results.length} answers with ${response.totalTokensUsed} tokens`);

    return NextResponse.json(response);
  } catch (error) {
    console.error("[api] /answer/batch error:", error);

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
        error: "Failed to generate batch answers",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/answer/batch/status
 * Get batch processing status (for future async implementation)
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

    // This is a placeholder for future async batch processing
    // For now, return not implemented
    return NextResponse.json(
      {
        message: "Async batch processing not yet implemented",
        note: "Use POST /api/answer/batch for synchronous batch processing",
      },
      { status: 501 }
    );
  } catch (error) {
    console.error("[api] /answer/batch status error:", error);

    return NextResponse.json(
      {
        error: "Failed to get batch status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
