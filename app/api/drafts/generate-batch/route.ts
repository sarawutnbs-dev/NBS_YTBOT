import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { generateDraftsForComments } from "@/lib/draftService";
import { generateDraftsForCommentsWithRAG } from "@/lib/draftServiceWithRAG";

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession() as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if RAG should be used (from query param or default to true)
    const { searchParams } = new URL(request.url);
    const useRAG = searchParams.get("useRAG") !== "false"; // Default to true

    console.log(`[API] Starting batch draft generation ${useRAG ? "with RAG" : "without RAG"}...`);

    let result;
    if (useRAG) {
      result = await generateDraftsForCommentsWithRAG();
    } else {
      result = await generateDraftsForComments();
    }

    console.log(`[API] ✅ ${result.message}`);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] ❌ Error generating batch drafts:", error);
    const message = error instanceof Error ? error.message : "Failed to generate drafts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
