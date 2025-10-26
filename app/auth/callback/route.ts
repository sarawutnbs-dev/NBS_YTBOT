import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const url = new URL("/api/auth/signin/google", request.url);
  return NextResponse.redirect(url);
}
