import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { generateDraftsForVideoWithRAG } from "@/lib/draftServiceWithRAG";

const requestSchema = z.object({
  videoId: z.string()
});

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession() as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const input = requestSchema.parse(body);

    console.log(`[API] Generating drafts for video ${input.videoId} with RAG + shortURL...`);

    const result = await generateDraftsForVideoWithRAG(input.videoId);

    console.log(`[API] ✅ ${result.message}`);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API] ❌ Error generating drafts for video:", error);
    const message = error instanceof Error ? error.message : "Failed to generate drafts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
