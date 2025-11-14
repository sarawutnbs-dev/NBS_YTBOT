import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAdmin, type AppSession } from "@/lib/permissions";

const settingsSchema = z.object({
  channelId: z.string().min(1),
  syncDays: z.number().int().min(1).max(30),
  maxSyncDays: z.number().int().min(1).max(30),
  aiTranscriptFallback: z.boolean().default(false),
  // AI Prompts
  firstPrompt: z.string().optional(),
  purchasePrompt: z.string().optional(),
  // Model Selection
  commentReplyModel: z.string().optional(),
  transcriptSummaryModel: z.string().optional(),
  productEmbeddingModel: z.string().optional(),
});

export async function GET() {
  const session = await getServerAuthSession() as AppSession | null;
  assert(isAdmin, session, "Forbidden");

  const settings = await prisma.appSetting.findFirst({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const session = await getServerAuthSession() as AppSession | null;
  assert(isAdmin, session, "Forbidden");

  const body = await request.json();
  const input = settingsSchema.parse(body);

  const data = {
    channelId: input.channelId,
    syncDays: input.syncDays,
    maxSyncDays: input.maxSyncDays,
    aiTranscriptFallback: input.aiTranscriptFallback,
    // AI Prompts - use null if empty string
    firstPrompt: input.firstPrompt || null,
    purchasePrompt: input.purchasePrompt || null,
    // Model Selection
    commentReplyModel: input.commentReplyModel || "gpt-5-mini",
    transcriptSummaryModel: input.transcriptSummaryModel || "gpt-5-mini",
    productEmbeddingModel: input.productEmbeddingModel || "gpt-5-mini",
  } as const;

  const record = await prisma.appSetting.upsert({
    where: { id: "default" },
    update: data as any,
    create: {
      id: "default",
      ...data
    } as any
  });

  return NextResponse.json(record);
}
