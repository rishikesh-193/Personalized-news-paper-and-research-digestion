import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { postAuthTarget, safeNextPath } from "@/lib/post-auth";

/**
 * Landing point after password sign-in and sign-up: the browser client has
 * written the session cookies, so the server verifies with getClaims() and
 * routes by profiles.onboarded (false -> /onboarding, true -> requested page).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(next)}`);
  }

  return NextResponse.redirect(await postAuthTarget(supabase, origin, next));
}
