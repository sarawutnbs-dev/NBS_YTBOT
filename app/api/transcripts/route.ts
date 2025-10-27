import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { listVideoIndex } from "@/lib/videoIndexService";

const querySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 1)),
  pageSize: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 20)),
});

export async function GET(request: NextRequest) {
  try {
    const session = (await getServerAuthSession()) as AppSession | null;
    assert(isAllowedUser, session, "Forbidden");

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      q: searchParams.get("q") || undefined,
      status: searchParams.get("status") || undefined,
      page: searchParams.get("page") || undefined,
      pageSize: searchParams.get("pageSize") || undefined,
    });

    const result = await listVideoIndex(params);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/transcripts] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch transcripts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
