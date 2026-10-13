/**
 * Chronicle ingestion pipeline — runs OUTSIDE Next.js (never on page load).
 *
 *   npm run ingest                 full run: fetch -> dedupe -> extract ->
 *                                  summarize -> save -> briefings
 *   npm run ingest -- --dry-run    no DB writes, prints a readable preview
 *   npm run ingest -- --limit N    process at most N new articles
 *
 * Env (from .env.local): GROQ_API_KEY, GROQ_MODEL_FAST,
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Secret values are never logged.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

import { RssAdapter } from "./adapters/rss";
import type { RawItem } from "./adapters/types";
import { FEEDS } from "./feeds";
import { extractReadableText } from "./extract";
import {
  GroqClient,
  InvalidOutputError,
  RateLimitExhaustedError,
} from "./groq";
import {
  createDb,
  fetchExistingArticles,
  insertArticle,
  upsertBriefing,
  type NewArticle,
} from "./db";
import {
  ARTICLE_JSON_SCHEMA,
  ArticleSummarySchema,
  BRIEFING_JSON_SCHEMA,
  BriefingSchema,
  TOPIC_LABELS,
} from "./schema";
import { log, logError, normalizeTitle, normalizeUrl, runPool } from "./util";

/** Only items published in this window are eligible. */
const FRESHNESS_DAYS = 3;
/** Default cap on new articles per run (env overrides: INGEST_MAX_NEW). */
const DEFAULT_MAX_NEW = 25;
/** At most this many articles summarized concurrently. */
const CONCURRENCY = 2;

interface Options {
  dryRun: boolean;
  limit: number | null;
}

function positiveInt(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flag} expects a positive integer, got "${raw}"`);
  }
  return value;
}

function parseArgs(argv: string[]): Options {
  let dryRun = false;
  let limit: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--limit") {
      limit = positiveInt(argv[++i] ?? "", "--limit");
    } else if (arg.startsWith("--limit=")) {
      limit = positiveInt(arg.slice("--limit=".length), "--limit");
    } else {
      throw new Error(`Unknown flag "${arg}" (supported: --dry-run, --limit N)`);
    }
  }
  return { dryRun, limit };
}

function maxNewPerRun(): number {
  const raw = process.env.INGEST_MAX_NEW;
  if (!raw) return DEFAULT_MAX_NEW;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    logError(`invalid INGEST_MAX_NEW "${raw}" — using ${DEFAULT_MAX_NEW}`);
    return DEFAULT_MAX_NEW;
  }
  return value;
}

/**
 * Applies the per-run cap with round-robin across (topic, source) groups so
 * one busy feed can never fill the whole cap — each group contributes its
 * freshest stories first, keeping every onboarding topic represented.
 */
function takeRoundRobin(candidates: RawItem[], limit: number): RawItem[] {
  const groups = new Map<string, RawItem[]>();
  for (const item of candidates) {
    const key = `${item.topic} | ${item.source}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );
  }

  const picked: RawItem[] = [];
  const queues = [...groups.values()];
  for (let index = 0; picked.length < limit; index++) {
    let advanced = false;
    for (const queue of queues) {
      if (picked.length >= limit) break;
      if (index < queue.length) {
        picked.push(queue[index]);
        advanced = true;
      }
    }
    if (!advanced) break;
  }
  return picked;
}

const ARTICLE_SYSTEM = [
  "You write digest entries for a personal newspaper.",
  "You receive ONE article's text, possibly truncated.",
  "Use ONLY facts present in the supplied text — never invent facts, numbers, names or quotes. If the text does not contain something, leave it out.",
  "Return JSON with exactly these fields:",
  '"summary_bullets": exactly 3 short factual strings (each one sentence, under 30 words),',
  '"why_it_matters": one sentence explaining why this matters to a reader,',
  '"topic": exactly one value from the allowed topics list given by the user.',
].join(" ");

function articleUser(item: RawItem, text: string): string {
  return [
    `Title: ${item.title}`,
    `Source: ${item.source}`,
    `Feed topic hint: ${item.topic}`,
    `Allowed topics: ${TOPIC_LABELS.join(", ")}`,
    "",
    "Article text (truncated):",
    '"""',
    text,
    '"""',
    "",
    "Reply with ONE JSON object only (no markdown, no commentary) with exactly these keys: summary_bullets (array of exactly 3 strings), why_it_matters (string), topic (one of the allowed topics).",
    'Example shape: {"summary_bullets":["fact one","fact two","fact three"],"why_it_matters":"One sentence.","topic":"Technology"}',
  ].join("\n");
}

const BRIEFING_SYSTEM = [
  "You write the daily briefing for one topic in a personal newspaper (3 to 4 sentences).",
  "Use ONLY the supplied stored article summaries — never invent facts, numbers or names.",
  'Return JSON with a single field "text".',
].join(" ");

function briefingUser(topic: string, date: string, rows: NewArticle[]): string {
  const summaries = rows
    .map(
      (row, index) =>
        `${index + 1}. ${row.title} — ${row.summaryBullets.join(" ")} Why it matters: ${row.whyItMatters}`,
    )
    .join("\n");
  return [
    `Date: ${date}`,
    `Topic: ${topic}`,
    "Stored summaries:",
    summaries,
    "",
    "Reply with ONE JSON object only (no markdown, no commentary) with exactly one key: text (the 3- to 4-sentence briefing).",
    'Example shape: {"text":"Sentence one. Sentence two. Sentence three."}',
  ].join("\n");
}

function printPreview(row: NewArticle): void {
  log(
    `[dry-run] would save | ${row.topic} | ${row.sourceName} | ${row.publishedAt ?? "unknown date"} | ${row.url}`,
  );
  log(`  title: ${row.title}`);
  for (const bullet of row.summaryBullets) log(`  • ${bullet}`);
  log(`  why it matters: ${row.whyItMatters}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const cap = Math.min(maxNewPerRun(), options.limit ?? Number.POSITIVE_INFINITY);

  log(
    `run starting${options.dryRun ? " (dry run — no DB writes)" : ""} — ` +
      `${FEEDS.length} feeds, cap ${cap} new articles, ${CONCURRENCY} concurrent`,
  );

  const groq = new GroqClient(); // throws early if GROQ_* env is missing
  const db = createDb();
  const existing = db ? await fetchExistingArticles(db) : null;

  // 1. Fetch all feeds (timeout + User-Agent are handled by the adapter).
  const raw = await new RssAdapter(FEEDS).fetch();
  const fetched = raw.length;
  log(`fetched ${fetched} items`);

  // 2. Normalize URLs, 3-day freshness window, dedupe (URL + near-duplicate
  //    titles, both in-run and against what is already stored), then cap.
  const cutoff = Date.now() - FRESHNESS_DAYS * 24 * 60 * 60 * 1_000;
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const candidates: RawItem[] = [];
  let skipped = 0;

  for (const item of raw) {
    const url = normalizeUrl(item.url);
    const titleKey = normalizeTitle(item.title ?? "");
    if (!url || !titleKey || !item.publishedAt) {
      skipped++; // no usable URL/title/date — freshness cannot be verified
      continue;
    }
    if (item.publishedAt.getTime() < cutoff) {
      skipped++; // older than 3 days
      continue;
    }
    if (seenUrls.has(url) || seenTitles.has(titleKey)) {
      skipped++; // duplicate within this run
      continue;
    }
    if (existing?.urls.has(url) || existing?.titles.has(titleKey)) {
      skipped++; // already in articles
      continue;
    }
    seenUrls.add(url);
    seenTitles.add(titleKey);
    candidates.push({ ...item, url });
  }

  const toProcess = takeRoundRobin(candidates, cap);
  skipped += candidates.length - toProcess.length; // over the cap
  log(
    `${fetched} fetched → ${candidates.length} fresh & unique → processing ${toProcess.length}`,
  );

  // 3. Extract readable text and summarize once per article (max 2 at a time).
  const rows: NewArticle[] = [];
  let attempted = 0;
  let saved = 0;
  let failed = 0;

  await runPool(
    toProcess,
    CONCURRENCY,
    async (item) => {
      attempted++;
      try {
        const text = await extractReadableText(
          item.url,
          item.summary,
          item.title,
        );
        // Nothing worth summarizing (page blocked AND no real feed summary,
        // e.g. a placeholder like "No content available") — the model would
        // only produce filler, so skip instead of storing junk.
        if (text === item.title || text.length < 100) {
          skipped++;
          log(`no readable text for ${item.url} — skipping`);
          return;
        }
        const summary = await groq.complete({
          what: `summary for "${item.title.slice(0, 60)}"`,
          system: ARTICLE_SYSTEM,
          user: articleUser(item, text),
          jsonSchema: ARTICLE_JSON_SCHEMA,
          zodSchema: ArticleSummarySchema,
        });

        const row: NewArticle = {
          url: item.url,
          title: item.title,
          sourceName: item.source,
          publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
          summaryBullets: summary.summary_bullets,
          whyItMatters: summary.why_it_matters,
          topic: summary.topic,
        };

        if (options.dryRun) {
          rows.push(row);
          printPreview(row);
        } else if (db) {
          const result = await insertArticle(db, row);
          if (result === "inserted") {
            rows.push(row);
            saved++;
          } else if (result === "duplicate") {
            skipped++;
          } else {
            failed++;
          }
        } else {
          failed++;
          logError(`database unavailable — cannot save "${item.title}"`);
        }
      } catch (error) {
        if (error instanceof RateLimitExhaustedError) {
          skipped++; // persistent 429 — the pool stops pulling new items
          return;
        }
        failed++;
        const detail =
          error instanceof InvalidOutputError
            ? `invalid output after retry — skipping (${error.message})`
            : error instanceof Error
              ? error.message
              : String(error);
        logError(`failed: ${item.url} — ${detail}`);
      }
    },
    () => groq.stopped,
  );
  skipped += toProcess.length - attempted; // never attempted (rate-limit stop)

  // 4. One briefing per topic that got new articles today (stored summaries
  //    only), upserted on (date, topic).
  if (rows.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const topics = [...new Set(rows.map((row) => row.topic))];

    for (const topic of topics) {
      if (groq.stopped) {
        logError("briefings skipped — stopping after persistent rate limits");
        break;
      }
      try {
        const topicRows = rows.filter((row) => row.topic === topic);
        const briefing = await groq.complete({
          what: `briefing for ${topic}`,
          system: BRIEFING_SYSTEM,
          user: briefingUser(topic, today, topicRows),
          jsonSchema: BRIEFING_JSON_SCHEMA,
          zodSchema: BriefingSchema,
        });

        if (options.dryRun) {
          log(`[dry-run] would upsert briefing ${today}/${topic}: ${briefing.text}`);
        } else if (db) {
          const ok = await upsertBriefing(db, {
            date: today,
            topic,
            text: briefing.text,
          });
          if (ok) log(`briefing saved for ${topic} (${today})`);
          else failed++;
        } else {
          failed++;
        }
      } catch (error) {
        if (error instanceof RateLimitExhaustedError) break;
        failed++;
        logError(
          `briefing failed for ${topic} — ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  // 5. One summary line, every run.
  const drySuffix = options.dryRun ? " (dry run — no DB writes)" : "";
  log(
    `fetched=${fetched} new=${toProcess.length} saved=${saved} skipped=${skipped} failed=${failed}${drySuffix}`,
  );
}

/**
 * Feed/article sockets can keep the event loop alive after the run is done.
 * Give stdout/stderr a moment to flush, then force the exit so the job
 * (and GitHub Actions step) always terminates.
 */
function exitAfterFlush(code: number): void {
  setTimeout(() => process.exit(code), 250);
}

main()
  .then(() => exitAfterFlush(0))
  .catch((error) => {
    logError(error instanceof Error ? error.message : String(error));
    exitAfterFlush(1);
  });
