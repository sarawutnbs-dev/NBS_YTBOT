import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { getRagStats, getRagHealth, getDocumentDetails } from "@/lib/rag/stats";

/**
 * GET /api/rag/stats
 * Get comprehensive RAG system statistics
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
    const type = searchParams.get("type") || "overview";
    const docId = searchParams.get("docId");

    // Get document details
    if (type === "document" && docId) {
      const details = await getDocumentDetails(parseInt(docId));
      return NextResponse.json(details);
    }

    // Get health status
    if (type === "health") {
      const health = await getRagHealth();
      return NextResponse.json(health);
    }

    // Get full stats (default)
    const stats = await getRagStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[api] /rag/stats error:", error);

    return NextResponse.json(
      {
        error: "Failed to get RAG stats",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
