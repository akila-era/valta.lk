import { NextResponse, type NextRequest } from "next/server";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * DEMO_READ_ONLY=true turns the site into a browse-only public demo: every write (checkout, account and admin
 * sign-in, reservations, order sync, server actions) is refused before it reaches a route.
 */
export function proxy(request: NextRequest) {
  if (process.env.DEMO_READ_ONLY !== "true" || READ_METHODS.has(request.method)) return NextResponse.next();
  return NextResponse.json(
    { error: { code: "DEMO_READ_ONLY", message: "This is a read-only demo. Orders, sign-in and changes are disabled." } },
    { status: 403 },
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
