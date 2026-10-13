"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { chunkText, embedTexts } from "@/lib/embeddings";

export interface ActionResult {
  ok: boolean;
  state?: boolean;
  error?: string;
}

async function requireUser(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { supabase, userId: data.claims.sub };
}

/**
 * Indexes a saved article for Ask: chunk the STORED summary (titles,
 * bullets, why-it-matters — summaries and links, never republished full
 * text) and embed the chunks into `chunks` under the saver's own user_id.
 * Idempotent: existing chunks for this (user, article) are replaced.
 * Best-effort — a save must succeed even if indexing fails; the user can
 * unsave and resave to retry.
 */
async function indexArticleForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  articleId: string,
): Promise<void> {
  const { data: article, error } = await supabase
    .from("articles")
    .select("id, title, source_name, summary_bullets, why_it_matters")
    .eq("id", articleId)
    .single();
  if (error || !article) return;

  const bullets = Array.isArray(article.summary_bullets)
    ? article.summary_bullets.filter(
        (bullet: unknown): bullet is string => typeof bullet === "string",
      )
    : [];
  const text = [
    article.title,
    article.source_name ? `Source: ${article.source_name}` : "",
    ...bullets,
    article.why_it_matters ? `Why it matters: ${article.why_it_matters}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const chunks = chunkText(text, 1_400, 150);
  if (chunks.length === 0) return;

  const vectors = await embedTexts(chunks.map((chunk) => chunk.content));

  await supabase
    .from("chunks")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", "article")
    .eq("source_id", articleId);

  const { error: insertError } = await supabase.from("chunks").insert(
    chunks.map((chunk, index) => ({
      user_id: userId,
      source_type: "article",
      source_id: articleId,
      content: chunk.content,
      embedding: vectors[index],
    })),
  );
  if (insertError) throw new Error(`chunk insert failed: ${insertError.code}`);
}

/**
 * Save / unsave an article (one `save` event per user+article).
 * Saving also indexes the article's summary for Ask.
 */
export async function toggleSaveArticleAction(
  articleId: string,
): Promise<ActionResult> {
  const context = await requireUser();
  if (!context) return { ok: false, error: "Sign in again to save articles." };
  const { supabase, userId } = context;

  const { data: existing, error: selectError } = await supabase
    .from("article_events")
    .select("id")
    .eq("user_id", userId)
    .eq("article_id", articleId)
    .eq("event", "save")
    .maybeSingle();
  if (selectError) {
    return { ok: false, error: "Could not read your library. Try again." };
  }

  if (existing) {
    const { error: deleteError } = await supabase
      .from("article_events")
      .delete()
      .eq("id", existing.id);
    if (deleteError) {
      return { ok: false, error: "Could not unsave. Try again." };
    }
    // Drop the personal chunks too — unsaved content should not be retrievable.
    await supabase
      .from("chunks")
      .delete()
      .eq("user_id", userId)
      .eq("source_type", "article")
      .eq("source_id", articleId);
    revalidatePath("/today");
    revalidatePath("/library");
    revalidatePath("/ask");
    return { ok: true, state: false };
  }

  const { error: insertError } = await supabase.from("article_events").insert({
    user_id: userId,
    article_id: articleId,
    event: "save",
  });
  if (insertError) {
    return { ok: false, error: "Could not save. Try again." };
  }

  try {
    await indexArticleForUser(supabase, userId, articleId);
  } catch {
    // Indexing is best-effort; the save itself stands.
  }

  revalidatePath("/today");
  revalidatePath("/library");
  revalidatePath("/ask");
  return { ok: true, state: true };
}

const REACTIONS = new Set(["like", "dislike", "skip"]);

/**
 * Records a personalization signal for an article: like, dislike, or
 * skip ("not interested"). Tapping the same reaction again removes it.
 */
export async function setArticleReactionAction(
  articleId: string,
  reaction: "like" | "dislike" | "skip",
): Promise<ActionResult> {
  if (!REACTIONS.has(reaction)) return { ok: false, error: "Unknown reaction." };
  const context = await requireUser();
  if (!context) return { ok: false, error: "Sign in again." };
  const { supabase, userId } = context;

  const { data: existing, error: selectError } = await supabase
    .from("article_events")
    .select("id")
    .eq("user_id", userId)
    .eq("article_id", articleId)
    .eq("event", reaction)
    .maybeSingle();
  if (selectError) {
    return { ok: false, error: "Could not save your feedback. Try again." };
  }

  if (existing) {
    const { error: deleteError } = await supabase
      .from("article_events")
      .delete()
      .eq("id", existing.id);
    revalidatePath("/today");
    return { ok: !deleteError, state: false };
  }

  // One reaction at a time: clear the other reaction kinds first.
  await supabase
    .from("article_events")
    .delete()
    .eq("user_id", userId)
    .eq("article_id", articleId)
    .in("event", ["like", "dislike", "skip"]);

  const { error: insertError } = await supabase.from("article_events").insert({
    user_id: userId,
    article_id: articleId,
    event: reaction,
  });
  revalidatePath("/today");
  if (insertError) {
    return { ok: false, error: "Could not save your feedback. Try again." };
  }
  return { ok: true, state: true };
}
