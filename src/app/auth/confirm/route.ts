import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { postAuthTarget, safeNextPath } from "@/lib/post-auth";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "email",
  "recovery",
  "magiclink",
]);

/**
 * Handles Supabase email links (confirm signup, confirm email, password
 * recovery) using verifyOtp with token_hash, per the current Supabase
 * Next.js SSR docs. Email templates must link to:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  if (tokenHash && type && OTP_TYPES.has(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      // Recovery links land on the reset-password screen directly; sign-up
      // and login links route by profiles.onboarded like every other
      // successful sign-in.
      if (type === "recovery") {
        return NextResponse.redirect(
          `${origin}${safeNextPath(next ?? "/reset-password")}`,
        );
      }
      return NextResponse.redirect(await postAuthTarget(supabase, origin, next));
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirm`);
}
