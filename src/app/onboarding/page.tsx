import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingView } from "@/components/views/onboarding-view";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Onboarding" };

function safeNext(next: string | undefined): string | null {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return null;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  // Already onboarded users edit their interests in /settings instead.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", data.claims.sub)
      .maybeSingle();
    if (profile?.onboarded) redirect("/today");
  }

  return <OnboardingView next={safeNext(params.next)} />;
}
