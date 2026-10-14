/**
 * Chronicle ingestion pipeline — runs OUTSIDE Next.js (never on page load).
 *
 *   npm run ingest                 full run: fetch -> dedupe -> extract ->
 *                                  summarize -> save -> briefings -> report
 *   npm run ingest -- --dry-run    no DB writes, prints a readable preview
 *   npm run ingest -- --limit N    process at most N new articles
 *
 * Env (from .env.local): GROQ_API_KEY, GROQ_MODEL_FAST,
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (or the legacy
 * SUPABASE_SERVICE_ROLE_KEY). Secret values are never logged.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

import { RssAdapter } from "./adapters/rss";
import type { RawItem, SourceFetchReport } from "./adapters/types";
import { ENABLED_FEEDS } from "./feeds";
import { allocateFairly } from "./allocate";
import { classifySubtopic, resolveTopic } from "./classify";
import { extractArticleText, stripTags } from "./extract";
import {
  GroqClient,
  InvalidOutputError,
  RateLimitExhaustedError,
} from "./groq";
import {
  createDb,
  fetchExistingArticles,
  insertArticle,
  subtopicColumnMissing,
  upsertBriefing,
  type NewArticle,
} from "./db";
import {
  ARTICLE_JSON_SCHEMA,
  ArticleSummarySchema,
  BRIEFING_JSON_SCHEMA,
  BriefingSchema,
} from "./schema";
import { findViolations, guardBasis, summaryOutputText } from "./guard";
import { log, logError, normalizeTitle, normalizeUrl, runPool } from "./util";

/** Only items published in this window are eligible. */
const FRESHNESS_DAYS = 3;
/**
 * Default cap on new articles per run (env overrides: INGEST_MAX_NEW).
 * Raised from 25 once the registry grew to every onboarding topic: with a fair
 * per-category rotation a low cap means each category gets roughly one article
 * per run, which is what left 35 of 46 topics with nothing stored. The cap is
 * a budget, not a target — sources are bounded well before it.
 */
const DEFAULT_MAX_NEW = 60;
/**
 * At most this many articles summarized concurrently. Kept low because the
 * bottleneck is the Groq rate limit, not local CPU: GroqClient backs off on
 * 429 and the pool stops cleanly if the limit persists.
 */
const SUMMARY_CONCURRENCY = 2;
/** Optional ceiling per category (env: INGEST_MAX_PER_CATEGORY). */
const DEFAULT_MAX_PER_CATEGORY = 6;

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

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    logError(`invalid ${name} "${raw}" — using ${fallback}`);
    return fallback;
  }
  return value;
}

/** Counters behind the end-of-run report (section 9 of the coverage brief). */
interface RunStats {
  sourcesAttempted: number;
  sourcesOk: number;
  sourcesEmpty: number;
  sourcesFailed: number;
  entriesFetched: number;
  entriesDated: number;
  candidates: number;
  overBudget: number;
  attempted: number;
  saved: number;
  duplicates: number;
  /** Dropped before any LLM call: no URL/title/date, too old, already stored. */
  rejectedEarly: number;
  /** Unusable page/feed text — nothing worth summarizing. */
  unusableText: number;
  extractionFailures: number;
  /** Model output rejected by zod after its retry. */
  invalidOutputs: number;
  /** Summaries that failed the source-text guard twice. */
  guardFailures: number;
  rateLimitEvents: number;
  insertFailures: number;
  /** Selected but never started because the pool stopped on rate limits. */
  notAttempted: number;
  briefingsSaved: number;
  savedByCategory: Record<string, number>;
  savedBySubtopic: Record<string, number>;
  /** Per-category counts of what the feeds offered, before the budget. */
  offeredByCategory: Record<string, number>;
  /** Per-category counts the allocator selected (independent of dry-run). */
  selectedByCategory: Record<string, number>;
}

function emptyStats(): RunStats {
  return {
    sourcesAttempted: 0,
    sourcesOk: 0,
    sourcesEmpty: 0,
    sourcesFailed: 0,
    entriesFetched: 0,
    entriesDated: 0,
    candidates: 0,
    overBudget: 0,
    attempted: 0,
    saved: 0,
    duplicates: 0,
    rejectedEarly: 0,
    unusableText: 0,
    extractionFailures: 0,
    invalidOutputs: 0,
    guardFailures: 0,
    rateLimitEvents: 0,
    insertFailures: 0,
    notAttempted: 0,
    briefingsSaved: 0,
    savedByCategory: {},
    savedBySubtopic: {},
    offeredByCategory: {},
    selectedByCategory: {},
  };
}

function bump(record: Record<string, number>, key: string, by = 1): void {
  record[key] = (record[key] ?? 0) + by;
}

const ARTICLE_SYSTEM = [
  "You write digest entries for a personal newspaper.",
  "You receive ONE article's text, possibly truncated.",
  "Every bullet and the why-it-matters sentence may state ONLY facts that appear in the supplied text — no outside context, no assumptions, no inferred names, and no numbers that are not in the text.",
  "Keep every relation exactly as the text states it: buyers stay buyers, sellers stay sellers; never merge two separate facts into one new claim.",
  "If the text does not contain something, leave it out.",
  "Return JSON with exactly these fields:",
  '"summary_bullets": exactly 3 short factual strings (each one sentence, under 30 words),',
  '"why_it_matters": one sentence explaining why this matters to a reader.',
].join(" ");

function articleUser(item: RawItem, text: string): string {
  return [
    `Title: ${item.title}`,
    `Source: ${item.source}`,
    "",
    "Article text (truncated):",
    '"""',
    text,
    '"""',
    "",
    "Reply with ONE JSON object only (no markdown, no commentary) with exactly these keys: summary_bullets (array of exactly 3 strings), why_it_matters (string).",
    'Example shape: {"summary_bullets":["fact one","fact two","fact three"],"why_it_matters":"One sentence."}',
  ].join("\n");
}

const BRIEFING_SYSTEM = [
  "You write the daily briefing for one topic in a personal newspaper: 3 to 4 sentences, at most 120 words.",
  "Use ONLY the supplied stored article summaries — never invent facts, numbers or names.",
  'Return JSON with a single field "text".',
].join(" ");

/** Sends only stored titles + summary bullets — never extracted full text. */
function briefingUser(topic: string, date: string, rows: NewArticle[]): string {
  const summaries = rows
    .map(
      (row, index) => `${index + 1}. ${row.title} — ${row.summaryBullets.join(" ")}`,
    )
    .join("\n");
  return [
    `Date: ${date}`,
    `Topic: ${topic}`,
    "Stored article titles and summary bullets (nothing else):",
    summaries,
    "",
    "Reply with ONE JSON object only (no markdown, no commentary) with exactly one key: text (the 3- to 4-sentence briefing, at most 120 words).",
    'Example shape: {"text":"Sentence one. Sentence two. Sentence three."}',
  ].join("\n");
}

function printPreview(row: NewArticle): void {
  log(
    `[dry-run] would save | ${row.topic}${row.subtopic ? ` / ${row.subtopic}` : ""} | ` +
      `${row.sourceName} | ${row.publishedAt ?? "unknown date"} | ${row.url}`,
  );
  log(`  title: ${row.title}`);
  for (const bullet of row.summaryBullets) log(`  • ${bullet}`);
  log(`  why it matters: ${row.whyItMatters}`);
}

function printSourceReport(sources: SourceFetchReport[]): void {
  const failed = sources
    .filter((source) => source.outcome === "error")
    .sort((a, b) => a.source.localeCompare(b.source));
  const empty = sources.filter((source) => source.outcome === "empty");
  const undated = sources.filter(
    (source) => source.outcome === "ok" && source.dated === 0,
  );

  if (failed.length > 0) {
    log(`feeds failed (${failed.length}):`);
    for (const source of failed) {
      log(
        `  ✗ ${source.id} [${source.topic} / ${source.source}] — ` +
          `${source.error ?? "error"}`,
      );
    }
  }
  if (empty.length > 0) {
    log(
      `feeds returned no items (${empty.length}): ${empty
        .map((source) => source.id)
        .join(", ")}`,
    );
  }
  if (undated.length > 0) {
    log(
      `feeds returned items with no usable date (${undated.length}) — every such ` +
        `item is dropped by the freshness check: ${undated
          .map((source) => `${source.id}(${source.entries})`)
          .join(", ")}`,
    );
  }

  // A source that exposes plenty of entries but yields nothing usable is the
  // case a summary count hides: it looks healthy in the registry yet adds no
  // coverage. Name it, so "thin category" can be diagnosed rather than guessed.
  //
  // The usual cause is NOT a dead feed — it is an overlap: much of what these
  // publish falls outside the freshness window, or a sibling feed (ScienceDaily
  // all.xml vs mind_brain.xml, several Guardian sections) claimed the same
  // normalized title first. Those items are genuinely not new coverage, so the
  // right response is to look downstream, not to park the feed.
  const barren = sources
    .filter((source) => source.outcome === "ok" && source.dated > 0 && source.accepted === 0)
    .sort((a, b) => b.entries - a.entries);
  if (barren.length > 0) {
    log(
      `sources exposing items but adding NO usable news (${barren.length}) — ` +
        "all of it was outside the freshness window, already stored, or " +
        "already claimed by a sibling feed in this run:",
    );
    for (const source of barren.slice(0, 15)) {
      log(
        `  · ${source.id} [${source.topic}] entries ${source.entries}, dated ` +
          `${source.dated}, accepted 0`,
      );
    }
    if (barren.length > 15) log(`  … and ${barren.length - 15} more`);
  }

  const contributing = sources.filter((source) => source.accepted > 0).length;
  log(
    `sources contributing usable news: ${contributing}/${sources.length}` +
      ` (top: ${sources
        .filter((source) => source.accepted > 0)
        .sort((a, b) => b.accepted - a.accepted)
        .slice(0, 5)
        .map((source) => `${source.id}:${source.accepted}`)
        .join(", ")})`,
  );
}

function printCategoryReport(stats: RunStats, dryRun: boolean): void {
  const categories = Object.keys(stats.offeredByCategory).sort();
  if (categories.length === 0) return;
  const storedVerb = dryRun ? "would save" : "stored";
  log("");
  log(
    `per-category outcome (offered = fresh & unique before the budget, ` +
      `selected = won a budget slot, ${storedVerb} = actually written):`,
  );
  for (const category of categories) {
    const offered = stats.offeredByCategory[category] ?? 0;
    const selected = stats.selectedByCategory[category] ?? 0;
    const stored = dryRun ? selected : (stats.savedByCategory[category] ?? 0);
    const mark =
      stored === 0
        ? "  ← nothing"
        : stored < selected
          ? "  ← dropped after selection"
          : "";
    log(
      `  ${category.padEnd(18)} offered ${String(offered).padStart(4)}  ` +
        `selected ${String(selected).padStart(3)}  ${storedVerb} ${String(stored).padStart(3)}${mark}`,
    );
  }
}

function printReport(
  stats: RunStats,
  sources: SourceFetchReport[],
  startedAt: number,
  dryRun: boolean,
): void {
  const seconds = ((Date.now() - startedAt) / 1_000).toFixed(1);
  log("");
  log("──────────── run report ────────────");
  log(
    `sources: ${stats.sourcesAttempted} attempted, ${stats.sourcesOk} ok, ` +
      `${stats.sourcesEmpty} empty, ${stats.sourcesFailed} failed`,
  );
  log(
    `entries: ${stats.entriesFetched} fetched, ${stats.entriesDated} dated ` +
      `(${stats.entriesFetched - stats.entriesDated} dropped for no date)`,
  );
  log(
    `pipeline: ${stats.candidates} fresh & unique → ${stats.attempted} processed ` +
      `(${stats.overBudget} over budget)`,
  );
  log(
    `outcomes: ${stats.saved} stored, ${stats.duplicates} duplicates skipped, ` +
      `${stats.rejectedEarly} rejected early, ${stats.unusableText} unusable text, ` +
      `${stats.extractionFailures} extraction failures, ${stats.invalidOutputs} invalid outputs, ` +
      `${stats.guardFailures} guard failures, ${stats.insertFailures} insert failures`,
  );
  if (stats.notAttempted > 0) {
    log(
      `stopped early: ${stats.notAttempted} selected article(s) were never attempted ` +
        `(rate limits) — they stay fresh and are picked up by the next run`,
    );
  }
  log(
    `llm: ${stats.rateLimitEvents} rate-limit events, ${stats.briefingsSaved} briefings saved` +
      (subtopicColumnMissing()
        ? " — NOTE: articles.subtopic missing, run supabase/migrations/004_coverage.sql"
        : ""),
  );
  printCategoryReport(stats, dryRun);
  printSourceReport(sources);
  log(`duration: ${seconds}s`);
  log("────────────────────────────────────");
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const cap = Math.min(
    envInt("INGEST_MAX_NEW", DEFAULT_MAX_NEW),
    options.limit ?? Number.POSITIVE_INFINITY,
  );
  const perCategoryCap = envInt("INGEST_MAX_PER_CATEGORY", DEFAULT_MAX_PER_CATEGORY);
  const stats = emptyStats();

  log(
    `run starting${options.dryRun ? " (dry run — no DB writes)" : ""} — ` +
      `${ENABLED_FEEDS.length} feeds, cap ${cap} new articles ` +
      `(≤${perCategoryCap}/category), ${SUMMARY_CONCURRENCY} concurrent`,
  );

  const groq = new GroqClient(); // throws early if GROQ_* env is missing
  const db = createDb();
  const existing = db ? await fetchExistingArticles(db) : null;

  // 1. Fetch all feeds (bounded concurrency, per-feed timeout + retries).
  const { items: raw, sources } = await new RssAdapter(ENABLED_FEEDS).fetch();
  stats.sourcesAttempted = sources.length;
  stats.sourcesOk = sources.filter((s) => s.outcome === "ok").length;
  stats.sourcesEmpty = sources.filter((s) => s.outcome === "empty").length;
  stats.sourcesFailed = sources.filter((s) => s.outcome === "error").length;
  stats.entriesFetched = raw.length;
  stats.entriesDated = raw.filter((item) => item.publishedAt !== null).length;
  log(`fetched ${raw.length} items from ${stats.sourcesOk} working feeds`);

  // 2. Normalize URLs, 3-day freshness window, dedupe (URL + near-duplicate
  //    titles, both in-run and against what is already stored). Everything
  //    rejected here is rejected BEFORE any extraction or LLM call.
  const cutoff = Date.now() - FRESHNESS_DAYS * 24 * 60 * 60 * 1_000;
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const candidates: RawItem[] = [];
  /** Feed URL → items from it that survived freshness + dedupe. */
  const acceptedByFeed = new Map<string, number>();

  for (const item of raw) {
    const url = normalizeUrl(item.url);
    const titleKey = normalizeTitle(item.title ?? "");
    if (!url || !titleKey || !item.publishedAt) {
      stats.rejectedEarly++; // no usable URL/title/date — freshness unverifiable
      continue;
    }
    if (item.publishedAt.getTime() < cutoff) {
      stats.rejectedEarly++; // older than the freshness window
      continue;
    }
    if (seenUrls.has(url) || seenTitles.has(titleKey)) {
      stats.rejectedEarly++; // duplicate within this run
      continue;
    }
    if (existing?.urls.has(url) || existing?.titles.has(titleKey)) {
      stats.duplicates++; // already in articles
      continue;
    }
    seenUrls.add(url);
    seenTitles.add(titleKey);
    // Feed topics are validated here so a typo in feeds.ts lands in the
    // documented fallback instead of creating an unreachable category.
    const topic = resolveTopic(item.topic);
    if (topic !== item.topic) {
      logError(
        `feed "${item.source}" declares unknown topic "${item.topic}" — using "${topic}"`,
      );
    }
    const settled = { ...item, url, topic };
    candidates.push(settled);
    bump(stats.offeredByCategory, topic);
    if (item.feedUrl) {
      acceptedByFeed.set(item.feedUrl, (acceptedByFeed.get(item.feedUrl) ?? 0) + 1);
    }
  }
  stats.candidates = candidates.length;
  for (const report of sources) report.accepted = acceptedByFeed.get(report.url) ?? 0;

  // 3. Fair allocation: every category gets a slot before any category gets
  //    a second, and within a category sources rotate.
  const allocation = allocateFairly(candidates, { cap, perCategoryCap });
  const toProcess = allocation.picked;
  stats.overBudget = allocation.overBudget;
  stats.selectedByCategory = { ...allocation.perCategory };
  log(
    `${raw.length} fetched → ${candidates.length} fresh & unique → processing ` +
      `${toProcess.length} across ${Object.keys(allocation.perCategory).length} categories`,
  );

  // 4. Extract readable text and summarize once per article.
  const rows: NewArticle[] = [];

  await runPool(
    toProcess,
    SUMMARY_CONCURRENCY,
    async (item) => {
      stats.attempted++;
      const topic = item.topic;
      try {
        let extracted;
        try {
          extracted = await extractArticleText(item.url, item.summary, item.title);
        } catch (error) {
          // extractArticleText never throws by design; guard anyway so one bad
          // page cannot take down the pool.
          stats.extractionFailures++;
          throw error;
        }
        const { text, fullPage } = extracted;
        // Nothing worth summarizing (page blocked AND no real feed summary,
        // e.g. a placeholder like "No content available") — the model would
        // only produce filler, so skip instead of storing junk.
        if (text === item.title || text.length < 100) {
          stats.unusableText++;
          log(`no readable text for ${item.url} — skipping`);
          return;
        }
        // Everything the summary may legitimately draw from: the excerpt the
        // model saw, the full page (beyond the 6000-char cut), the feed
        // summary and the title.
        const basis = guardBasis(text, fullPage, stripTags(item.summary), item.title);
        let summary = await groq.complete({
          what: `summary for "${item.title.slice(0, 60)}"`,
          system: ARTICLE_SYSTEM,
          user: articleUser(item, text),
          jsonSchema: ARTICLE_JSON_SCHEMA,
          zodSchema: ArticleSummarySchema,
        });

        // Source-text guard: every capitalized multi-word name and every
        // number in the output must occur in the article text. One retry,
        // then the article is skipped (never stored unverified).
        let violations = findViolations(
          summaryOutputText(summary.summary_bullets, summary.why_it_matters),
          basis,
        );
        if (violations.length > 0) {
          log(
            `guard: not in source — ${violations
              .map((violation) => `"${violation.token}"`)
              .join(", ")} — retrying once`,
          );
          const retry = await groq.complete({
            what: `summary (guard retry) for "${item.title.slice(0, 60)}"`,
            system: ARTICLE_SYSTEM,
            user: articleUser(item, text),
            jsonSchema: ARTICLE_JSON_SCHEMA,
            zodSchema: ArticleSummarySchema,
          });
          violations = findViolations(
            summaryOutputText(retry.summary_bullets, retry.why_it_matters),
            basis,
          );
          if (violations.length > 0) {
            stats.guardFailures++;
            logError(
              `guard failed after retry — skipping: ${item.url} (${violations
                .map((violation) => `"${violation.token}"`)
                .join(", ")})`,
            );
            return;
          }
          summary = retry;
        }

        const subtopic = classifySubtopic(topic, item.title, item.feedSubtopics);
        const row: NewArticle = {
          url: item.url,
          title: item.title,
          sourceName: item.source,
          publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
          summaryBullets: summary.summary_bullets,
          whyItMatters: summary.why_it_matters,
          topic,
          subtopic,
        };

        if (options.dryRun) {
          rows.push(row);
          printPreview(row);
        } else if (db) {
          const result = await insertArticle(db, row);
          if (result === "inserted") {
            rows.push(row);
            stats.saved++;
            bump(stats.savedByCategory, topic);
            bump(stats.savedBySubtopic, `${topic} / ${subtopic}`);
          } else if (result === "duplicate") {
            stats.duplicates++;
          } else {
            stats.insertFailures++;
          }
        } else {
          stats.insertFailures++;
          logError(`database unavailable — cannot save "${item.title}"`);
        }
      } catch (error) {
        if (error instanceof RateLimitExhaustedError) {
          stats.rateLimitEvents++;
          return; // persistent 429 — the pool stops pulling new items
        }
        if (error instanceof InvalidOutputError) {
          stats.invalidOutputs++;
        } else {
          stats.extractionFailures++;
        }
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
  // Articles the pool never started because `groq.stopped` flipped. Reported
  // explicitly: a run that stops early is resumable, not a silent shortfall.
  stats.notAttempted = toProcess.length - stats.attempted;

  // 5. Separate briefing pass, strictly after the articles are saved: one
  //    request at a time with a pause between requests (retry-after is
  //    honored inside GroqClient). If GROQ_MODEL_FAST keeps returning 429,
  //    briefings fall back to GROQ_MODEL_SMART (briefings only) rather than
  //    failing the run; a briefing is always skippable, never fatal.
  if (rows.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const topics = [...new Set(rows.map((row) => row.topic))];
    const PAUSE_BETWEEN_MS = 3_000;
    let briefingGroq = groq; // GROQ_MODEL_FAST unless rate-limited
    let fellBack = false;

    for (let index = 0; index < topics.length; index++) {
      const topic = topics[index];
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_MS));
      }
      const topicRows = rows.filter((row) => row.topic === topic);
      const briefingArgs = {
        what: `briefing for ${topic}`,
        system: BRIEFING_SYSTEM,
        user: briefingUser(topic, today, topicRows),
        jsonSchema: BRIEFING_JSON_SCHEMA,
        zodSchema: BriefingSchema,
      };

      let briefing: { text: string } | null = null;
      try {
        briefing = await briefingGroq.complete(briefingArgs);
      } catch (error) {
        if (error instanceof RateLimitExhaustedError && !fellBack) {
          // Fast model exhausted — switch to the smart model for briefings.
          fellBack = true;
          try {
            briefingGroq = new GroqClient("GROQ_MODEL_SMART");
            log("fast model rate limited — briefings continue on GROQ_MODEL_SMART");
            briefing = await briefingGroq.complete(briefingArgs);
          } catch (fallbackError) {
            if (fallbackError instanceof RateLimitExhaustedError) {
              stats.rateLimitEvents++;
              logError("rate limits on both models — skipping remaining briefings");
              break;
            }
            stats.insertFailures++;
            logError(
              `briefing failed for ${topic} — ${
                fallbackError instanceof Error
                  ? fallbackError.message
                  : String(fallbackError)
              }`,
            );
          }
        } else if (error instanceof RateLimitExhaustedError) {
          stats.rateLimitEvents++;
          logError("rate limits persisted on GROQ_MODEL_SMART — skipping remaining briefings");
          break;
        } else {
          stats.insertFailures++;
          logError(
            `briefing failed for ${topic} — ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      if (!briefing) continue; // skipped rather than failed

      if (options.dryRun) {
        log(`[dry-run] would upsert briefing ${today}/${topic}: ${briefing.text}`);
      } else if (db) {
        const ok = await upsertBriefing(db, {
          date: today,
          topic,
          text: briefing.text,
        });
        if (ok) {
          stats.briefingsSaved++;
          log(`briefing saved for ${topic} (${today})`);
        } else {
          stats.insertFailures++;
        }
      } else {
        stats.insertFailures++;
      }
    }
  }

  // 6. One summary line plus the full report, every run.
  const drySuffix = options.dryRun ? " (dry run — no DB writes)" : "";
  log(
    `fetched=${raw.length} new=${toProcess.length} saved=${stats.saved} ` +
      `skipped=${stats.rejectedEarly + stats.unusableText + stats.duplicates} ` +
      `failed=${stats.invalidOutputs + stats.guardFailures + stats.insertFailures}${drySuffix}`,
  );
  printReport(stats, sources, startedAt, options.dryRun);
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
