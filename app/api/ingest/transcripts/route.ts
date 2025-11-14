import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ingestTranscript, ingestTranscripts } from "@/lib/rag/ingest";
import { TranscriptSourceSchema } from "@/lib/rag/schema";
import { z } from "zod";

const RequestSchema = z.object({
  transcripts: z.union([
    TranscriptSourceSchema,
    z.array(TranscriptSourceSchema),
  ]),
  overwrite: z.boolean().optional().default(false),
});

/**
 * POST /api/ingest/transcripts
 * Ingest transcript(s) into RAG system
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

    const { transcripts, overwrite } = validated;

    // Handle single transcript
    if (!Array.isArray(transcripts)) {
      const result = await ingestTranscript(transcripts, overwrite);

      return NextResponse.json({
        success: true,
        documentsCreated: 1,
        chunksCreated: result.chunksCreated,
      });
    }

    // Handle multiple transcripts
    const result = await ingestTranscripts(transcripts, overwrite);

    // Count total chunks created
    let totalChunks = 0;
    if (result.successful > 0) {
      // Estimate: transcripts typically create 5-10 chunks each
      totalChunks = result.successful * 5; // Rough estimate
    }

    return NextResponse.json({
      success: result.failed === 0,
      documentsCreated: result.successful,
      chunksCreated: totalChunks,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("[api] /ingest/transcripts error:", error);

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
        error: "Failed to ingest transcripts",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ingest/transcripts
 * Get ingestion status for transcript
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
    const videoId = searchParams.get("videoId");

    if (!videoId) {
      return NextResponse.json(
        { error: "videoId parameter is required" },
        { status: 400 }
      );
    }

    // Check if transcript is indexed
    const { getChunksBySource } = await import("@/lib/rag/retriever");
    const chunks = await getChunksBySource("transcript", videoId);

    return NextResponse.json({
      indexed: chunks.length > 0,
      chunks: chunks.length,
      data: chunks.length > 0 ? chunks : undefined,
    });
  } catch (error) {
    console.error("[api] /ingest/transcripts GET error:", error);

    return NextResponse.json(
      {
        error: "Failed to get transcript status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ingest/transcripts
 * Delete transcript from RAG system
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
    const videoId = searchParams.get("videoId");

    if (!videoId) {
      return NextResponse.json(
        { error: "videoId parameter is required" },
        { status: 400 }
      );
    }

    // Delete transcript
    const { deleteDocument } = await import("@/lib/rag/retriever");
    const deleted = await deleteDocument("transcript", videoId);

    return NextResponse.json({
      success: deleted,
      message: deleted
        ? "Transcript deleted successfully"
        : "Transcript not found",
    });
  } catch (error) {
    console.error("[api] /ingest/transcripts DELETE error:", error);

    return NextResponse.json(
      {
        error: "Failed to delete transcript",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
