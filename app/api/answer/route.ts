import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateAnswer, previewContexts } from "@/lib/rag/answer";
import { AnswerRequestSchema } from "@/lib/rag/schema";
import { z } from "zod";

/**
 * POST /api/answer
 * Generate answer using RAG
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
    const validated = AnswerRequestSchema.parse(body);

    // Generate answer
    const response = await generateAnswer(validated);

    return NextResponse.json(response);
  } catch (error) {
    console.error("[api] /answer error:", error);

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
        error: "Failed to generate answer",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/answer/preview
 * Preview contexts for a query without generating answer (for debugging)
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
    const query = searchParams.get("query");
    const videoId = searchParams.get("videoId") || undefined;
    const includeProducts = searchParams.get("includeProducts") !== "false";
    const includeTranscripts = searchParams.get("includeTranscripts") !== "false";
    const includeComments = searchParams.get("includeComments") === "true";
    const topK = parseInt(searchParams.get("topK") || "6");

    if (!query) {
      return NextResponse.json(
        { error: "query parameter is required" },
        { status: 400 }
      );
    }

    // Preview contexts
    const result = await previewContexts(query, {
      videoId,
      includeProducts,
      includeTranscripts,
      includeComments,
      topK,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api] /answer preview error:", error);

    return NextResponse.json(
      {
        error: "Failed to preview contexts",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
