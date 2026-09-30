import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getOrCreateRequestId } from "./lib/security/requestId";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = getOrCreateRequestId(request);

  // Protect /admin routes, but allow /admin/login and static assets
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const adminSession =
      request.cookies.get("admin_session")?.value ||
      request.cookies.get("sb-access-token")?.value ||
      request.headers.get("authorization");

    if (!adminSession) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      redirectResponse.headers.set("x-request-id", requestId);
      return redirectResponse;
    }
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
