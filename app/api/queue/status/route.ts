import { NextResponse } from "next/server";
import { listJobs } from "@/lib/queue";
import { getServerAuthSession } from "@/lib/auth";
import { assert, isAllowedUser } from "@/lib/permissions";

export async function GET() {
  const session = await getServerAuthSession();
  assert(isAllowedUser, session, "Forbidden");

  return NextResponse.json(listJobs());
}
