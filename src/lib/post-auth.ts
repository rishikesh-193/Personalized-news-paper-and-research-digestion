import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sanitizes a `next` query parameter: only same-origin relative paths are
 * honoured; anything else falls back to /today.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/today";
}

/**
 * Post-sign-in routing, shared by /auth/callback (Google), /auth/confirm
 * (email links) and /auth/post-login (password sign-in): the user is verified
 * with getClaims() on the server, then profiles.onboarded decides between
 * /onboarding and the requested page.
 *
 * Returns an absolute URL on the same origin.
 */
export async function postAuthTarget(
  supabase: SupabaseClient,
  origin: string,
  next: string | null | undefined,
): Promise<string> {
  const safe = safeNextPath(next);

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
    ? safe
    : safe === "/today"
      ? "/onboarding"
      : `/onboarding?next=${encodeURIComponent(safe)}`;

  return `${origin}${target}`;
}
