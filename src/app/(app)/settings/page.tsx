import type { Metadata } from "next";
import { SettingsView } from "@/components/views/settings-view";
import { userFromClaims } from "@/lib/auth-user";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const user = userFromClaims(data?.claims);

  // Read the caller's interests (RLS scopes rows to auth.uid(); null = load failed).
  let initialInterests: string[] | null = [];
  if (user && data?.claims?.sub) {
    const { data: rows, error } = await supabase
      .from("interests")
      .select("topic")
      .eq("user_id", data.claims.sub)
      .order("topic", { ascending: true });
    if (error) {
      initialInterests = null;
    } else {
      initialInterests = (rows ?? []).map((row) => String(row.topic));
    }
  }

  return <SettingsView user={user} initialInterests={initialInterests} />;
}
