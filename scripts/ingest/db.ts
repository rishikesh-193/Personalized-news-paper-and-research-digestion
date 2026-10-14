import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logError, normalizeTitle } from "./util";

/**
 * Writes go through the service-role key (RLS bypass) — this runs only in the
 * scheduled ingestion job, never in the browser. Secret values are never
 * logged.
 */
export interface NewArticle {
  url: string;
  title: string;
  sourceName: string;
  publishedAt: string | null;
  summaryBullets: string[];
  whyItMatters: string;
  topic: string;
  /** Fine-grained label inside `topic` (see classify.SUBTOPIC_LABELS). */
  subtopic: string | null;
}

export interface BriefingRow {
  /** YYYY-MM-DD (UTC). */
  date: string;
  topic: string;
  text: string;
}

/** Returns null when the env is missing — the run continues without DB access. */
export function createDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    logError(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — " +
        "continuing without database dedupe and writes",
    );
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** URLs + normalized titles already in `articles` (skip re-summarizing and
 * cross-run near-duplicate titles). Returns null when the table cannot be
 * read (e.g. migration not run yet) — the caller then falls back to in-run
 * dedupe only. */
export interface ExistingArticles {
  urls: Set<string>;
  /** normalizeTitle()-normalized titles for near-duplicate detection. */
  titles: Set<string>;
}

export async function fetchExistingArticles(
  db: SupabaseClient,
): Promise<ExistingArticles | null> {
  const PAGE_SIZE = 1_000;
  const urls = new Set<string>();
  const titles = new Set<string>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("articles")
      .select("url, title")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      logError(
        `could not read existing articles (${error.code ?? "error"}: ${error.message}) — ` +
          "continuing without DB dedupe",
      );
      return null;
    }

    for (const row of data ?? []) {
      urls.add(String(row.url));
      const title = row.title == null ? "" : String(row.title);
      if (title) titles.add(normalizeTitle(title));
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  return { urls, titles };
}

export type InsertResult = "inserted" | "duplicate" | "failed";

/** Row shape written to `articles` (camelCase inputs mapped to columns). */
interface ArticleInsert {
  url: string;
  title: string;
  source_name: string;
  published_at: string | null;
  summary_bullets: string[];
  why_it_matters: string;
  topic_tag: string;
}

/** Same row plus the optional column added by migration 004. */
interface ArticleInsertWithSubtopic extends ArticleInsert {
  subtopic?: string | null;
}

/**
 * Whether `articles.subtopic` exists. `null` until the first insert tells us.
 * Migration 004 adds the column; until it is applied the run keeps working and
 * simply stores topics without subtopics instead of failing every insert.
 */
let subtopicSupported: boolean | null = null;

/** True once the run has learned that migration 004 is not applied yet. */
export function subtopicColumnMissing(): boolean {
  return subtopicSupported === false;
}

/** PostgREST reports an unknown column this way (PGRST204, schema cache miss). */
function isMissingSubtopic(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST204" ||
    (typeof error.message === "string" &&
      error.message.includes("subtopic") &&
      /column|schema cache/i.test(error.message))
  );
}

/** Inserts one summarized article; a unique-URL conflict counts as duplicate. */
export async function insertArticle(
  db: SupabaseClient,
  article: NewArticle,
): Promise<InsertResult> {
  const row: ArticleInsert = {
    url: article.url,
    title: article.title,
    source_name: article.sourceName,
    published_at: article.publishedAt,
    summary_bullets: article.summaryBullets,
    why_it_matters: article.whyItMatters,
    topic_tag: article.topic,
  };

  // Only send `subtopic` while it is believed to exist, so a run against a
  // database without migration 004 does not pay for a failed insert per
  // article. The first attempt discovers the truth.
  const includeSubtopic = subtopicSupported !== false;
  const payload: ArticleInsertWithSubtopic = includeSubtopic
    ? { ...row, subtopic: article.subtopic }
    : row;
  const { error } = await db.from("articles").insert(payload);

  if (!error) {
    subtopicSupported = true;
    return "inserted";
  }
  if (error.code === "23505") return "duplicate";

  if (includeSubtopic && isMissingSubtopic(error)) {
    // Migration 004 not applied — remember it and retry this article without
    // the column so no article is lost to a schema mismatch.
    subtopicSupported = false;
    logError(
      "articles.subtopic is missing — run supabase/migrations/004_coverage.sql; " +
        "continuing without subtopics for this run",
    );
    const retry = await db.from("articles").insert(row);
    if (!retry.error) return "inserted";
    if (retry.error.code === "23505") return "duplicate";
    logError(`insert failed for ${article.url} — ${retry.error.message}`);
    return "failed";
  }

  logError(`insert failed for ${article.url} — ${error.message}`);
  return "failed";
}

/** Upserts one topic's briefing for a date (PK: date + topic). */
export async function upsertBriefing(
  db: SupabaseClient,
  briefing: BriefingRow,
): Promise<boolean> {
  const { error } = await db
    .from("daily_briefings")
    .upsert(briefing, { onConflict: "date,topic" });

  if (error) {
    logError(
      `briefing upsert failed for ${briefing.topic} — ${error.message}`,
    );
    return false;
  }
  return true;
}
