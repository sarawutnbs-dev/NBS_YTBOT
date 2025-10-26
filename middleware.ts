import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/auth/login", "/api/auth"];
const isProduction =
  ((globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV ??
    "development") === "production";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  console.log('\n🔒 Middleware check:', pathname);
  
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    console.log('✅ Public path, allowing');
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secureCookie: isProduction });
  
  console.log('Token:', token ? '✅ Found' : '❌ Not found');

  if (!token) {
    console.log('❌ Redirecting to login');
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  console.log('✅ Allowing access\n');
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|auth/login).*)"]
};
