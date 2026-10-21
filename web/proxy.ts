import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_MOBILE_ORIGINS = ["https://localhost"];
const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS = "Content-Type, X-Model-Operation-Id";

export function allowedMobileOrigins(
  configured = process.env.MOBILE_ALLOWED_ORIGINS,
): Set<string> {
  const values = configured
    ? configured.split(",").map((value) => value.trim()).filter(Boolean)
    : DEFAULT_MOBILE_ORIGINS;
  return new Set(
    values.flatMap((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && url.origin === value ? [value] : [];
      } catch {
        return [];
      }
    }),
  );
}

function applyCorsHeaders(response: NextResponse, origin: string): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  response.headers.set("Access-Control-Allow-Headers", CORS_HEADERS);
  response.headers.set("Access-Control-Max-Age", "600");
  response.headers.append("Vary", "Origin");
  return response;
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const isSameOrigin = origin === request.nextUrl.origin;
  const isAllowedMobileOrigin = allowedMobileOrigins().has(origin);

  if (request.method === "OPTIONS") {
    if (!isAllowedMobileOrigin && !isSameOrigin) {
      return NextResponse.json(
        { error: { code: "CORS_ORIGIN_DENIED", message: "Origin 不允许访问此 API" } },
        { status: 403 },
      );
    }
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }

  const response = NextResponse.next();
  return isAllowedMobileOrigin ? applyCorsHeaders(response, origin) : response;
}

export const config = {
  matcher: "/api/v1/:path*",
};
