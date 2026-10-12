import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/today";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Verified server-side with getClaims(), then read profiles.onboarded
      // (set by /onboarding; the signup trigger creates the row).
      const { data } = await supabase.auth.getClaims();
      let onboarded = false;
      if (data?.claims?.sub) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarded")
          .eq("id", data.claims.sub)
          .maybeSingle();
        onboarded = Boolean(profile?.onboarded);
      }
      const target = onboarded
        ? next
        : next === "/today"
          ? "/onboarding"
          : `/onboarding?next=${encodeURIComponent(next)}`;
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
