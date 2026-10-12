import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { userFromClaims } from "@/lib/auth-user";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  // Verified server-side — never trusts the cookie payload.
  const { data } = await supabase.auth.getClaims();

  // Non-onboarded users finish setup first (same check as /auth/callback).
  if (data?.claims?.sub) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", data.claims.sub)
      .maybeSingle();
    if (!profile?.onboarded) redirect("/onboarding");
  }

  return <AppShell user={userFromClaims(data?.claims)}>{children}</AppShell>;
}
