import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";
import { appConfig } from "@/lib/config";
import { syncComments } from "@/jobs/syncComments";

const requestSchema = z.object({
  daysBack: z.number().int().min(1).max(appConfig.sync.maxDays).optional()
});

export async function POST(request: Request) {
  const session = await getServerAuthSession() as AppSession | null;
  assert(isAllowedUser, session, "Forbidden");

  const body = request.headers.get("content-length") ? await request.json() : {};
  const input = requestSchema.parse(body);

  const cutoffDays = input.daysBack ?? appConfig.sync.defaultDays;

  try {
    const result = await syncComments(cutoffDays);

    return NextResponse.json({
      synced: result.synced,
      affectedVideos: result.affectedVideoIds.length,
      videoIds: result.affectedVideoIds
    });
  } catch (error) {
    console.error("Sync comments error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to sync comments from YouTube";

    return NextResponse.json(
      {
        error: message,
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    );
  }
}
