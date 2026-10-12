import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/post-auth";

// Public routes: landing, the auth pages (login, signup, password recovery)
// and the auth routes where sessions are created or refreshed (OAuth
// callback, email-link confirm, post-login routing).
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/auth/confirm",
  "/auth/post-login",
]);

// Signed-in users have no business on the account-entry pages.
const AUTH_ENTRY_PATHS = new Set(["/login", "/signup"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const response = NextResponse.next({ request });
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getClaims() verifies the JWT on the server (never trusts the cookie
  // payload) and refreshes an expired session first; refreshed cookies are
  // written onto the response via setAll above.
  let authenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && Boolean(data?.claims);
  } catch {
    authenticated = false;
  }

  if (!authenticated && !PUBLIC_PATHS.has(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && AUTH_ENTRY_PATHS.has(pathname)) {
    return NextResponse.redirect(
      new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url),
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
