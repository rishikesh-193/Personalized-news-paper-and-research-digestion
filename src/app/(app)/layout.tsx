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

  return <AppShell user={userFromClaims(data?.claims)}>{children}</AppShell>;
}
