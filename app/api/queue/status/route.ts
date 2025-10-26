import { NextResponse } from "next/server";
import { listJobs } from "@/lib/queue";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser, type AppSession } from "@/lib/permissions";

export async function GET() {
  const session = await getServerAuthSession() as AppSession | null;
  assert(isAllowedUser, session, "Forbidden");

  return NextResponse.json(listJobs());
}
