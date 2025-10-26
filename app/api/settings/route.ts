import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAdmin } from "@/lib/permissions";

const settingsSchema = z.object({
  channelId: z.string().min(1),
  syncDays: z.number().int().min(1).max(30),
  maxSyncDays: z.number().int().min(1).max(30)
});

export async function GET() {
  const session = await getServerAuthSession();
  assert(isAdmin, session, "Forbidden");

  const settings = await prisma.appSetting.findFirst({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  assert(isAdmin, session, "Forbidden");

  const body = await request.json();
  const input = settingsSchema.parse(body);

  const record = await prisma.appSetting.upsert({
    where: { id: "default" },
    update: {
      channelId: input.channelId,
      syncDays: input.syncDays,
      maxSyncDays: input.maxSyncDays
    },
    create: {
      id: "default",
      channelId: input.channelId,
      syncDays: input.syncDays,
      maxSyncDays: input.maxSyncDays
    }
  });

  return NextResponse.json(record);
}
