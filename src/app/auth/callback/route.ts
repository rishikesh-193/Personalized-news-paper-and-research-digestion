import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { postAuthTarget, safeNextPath } from "@/lib/post-auth";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Verified server-side with getClaims(), then routed by
      // profiles.onboarded (shared with /auth/confirm and /auth/post-login).
      return NextResponse.redirect(await postAuthTarget(supabase, origin, next));
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
