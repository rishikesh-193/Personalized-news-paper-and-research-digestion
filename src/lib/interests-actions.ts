"use server";

import { createClient } from "@/lib/supabase/server";

interface ActionContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}

function normalize(topics: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of topics) {
    const topic = raw.trim();
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(topic);
  }
  return cleaned;
}

/** Verifies the caller server-side with getClaims() — never trusts the cookie. */
async function requireUser(): Promise<ActionContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { supabase, userId: data.claims.sub };
}

async function replaceInterests(
  context: ActionContext,
  topics: string[],
): Promise<{ ok: boolean; error?: string }> {
  const cleaned = normalize(topics);

  const removed = await context.supabase
    .from("interests")
    .delete()
    .eq("user_id", context.userId);
  if (removed.error) return { ok: false, error: removed.error.message };

  if (cleaned.length > 0) {
    const inserted = await context.supabase.from("interests").insert(
      cleaned.map((topic) => ({
        user_id: context.userId,
        topic,
      })),
    );
    if (inserted.error) return { ok: false, error: inserted.error.message };
  }

  return { ok: true };
}

/** /settings: replace the caller's interests rows. */
export async function saveInterestsAction(
  topics: string[],
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireUser();
  if (!context) {
    return { ok: false, error: "Your session could not be verified. Sign in again." };
  }
  return replaceInterests(context, topics);
}

/**
 * /onboarding: save interests and mark profiles.onboarded.
 * An empty list is allowed — it is the "Skip for now" path (onboard with
 * no interests yet; the user adds them later in /settings).
 */
export async function completeOnboardingAction(
  topics: string[],
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireUser();
  if (!context) {
    return { ok: false, error: "Your session could not be verified. Sign in again." };
  }

  const saved = await replaceInterests(context, topics);
  if (!saved.ok) return saved;

  const profile = await context.supabase
    .from("profiles")
    .upsert(
      { id: context.userId, onboarded: true },
      { onConflict: "id" },
    );
  if (profile.error) return { ok: false, error: profile.error.message };

  return { ok: true };
}
