/**
 * Read-only diagnosis of the guard's flagged stored summaries.
 *
 *   npx tsx scripts/ingest/diagnose-flags.ts
 *
 * Reproduces the audit flags (findViolations against the 6000-char page
 * excerpt — what the pipeline audits against), then probes each unsupported
 * token with a deliberately LOOSER matcher (apostrophes, hyphens and
 * plural-s ignored) across: the full page text (beyond the excerpt), the
 * feed summary, and the title — so a normalization gap can never masquerade
 * as a real fabrication. Evidence snippets are printed for each hit.
 *
 *   title | unsupported token(s) | where the token appears | verdict
 *
 * REAL = phrase absent everywhere and the page fetch works.
 * FALSE POSITIVE = loose probe found it somewhere legitimate.
 * UNVERIFIABLE = page unreachable (401/405/…) and no feed hit, so the
 *                source cannot be checked — never a deletion candidate.
 *
 * Never writes to the database.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

import { createClient } from "@supabase/supabase-js";
import { RssAdapter } from "./adapters/rss";
import { FEEDS } from "./feeds";
import { MAX_TEXT_CHARS, fetchFullPageText, stripTags } from "./extract";
import {
  findViolations,
  guardBasis,
  summaryOutputText,
  type GuardViolation,
} from "./guard";
import { log, normalizeUrl } from "./util";

interface StoredRow {
  id: string;
  url: string;
  title: string;
  summary_bullets: unknown;
  why_it_matters: unknown;
}

type Where = "other part of the page (beyond the excerpt)" | "feed summary" | "title";

function bulletsOf(row: StoredRow): string[] {
  return Array.isArray(row.summary_bullets)
    ? row.summary_bullets.filter(
        (bullet): bullet is string => typeof bullet === "string",
      )
    : [];
}

/** Over-permissive normalization: only used to LOCATE a token, never to
 *  enforce. Possessives dropped, apostrophes/hyphens/dashes to spaces,
 *  trailing plural -s dropped, lowercase, whitespace collapsed. */
function loose(text: string): string {
  return text
    .toLowerCase()
    .replace(/(?<=[a-z0-9])[\u2018\u2019']s\b/g, "")
    .replace(/[\u2018\u2019'".,;:!?()\[\]]/g, " ")
    .replace(/[-\u2010-\u2015/]/g, " ")
    .replace(/\b(\w{4,})s\b/g, "$1")
    .replace(/\s+/g, " ");
}

function looseContains(token: string, text: string): boolean {
  if (!text) return false;
  return loose(text).includes(loose(token));
}

/** Longest word of the token → first case-insensitive hit → ±70 chars. */
function evidence(token: string, text: string): string {
  if (!text) return "";
  const words = token
    .split(/\s+/)
    .map((word) => word.replace(/[^\w]/g, ""))
    .filter((word) => word.length >= 5)
    .sort((a, b) => b.length - a.length);
  for (const word of words) {
    const index = text.toLowerCase().indexOf(word.toLowerCase());
    if (index >= 0) {
      const start = Math.max(0, index - 70);
      const end = Math.min(text.length, index + word.length + 70);
      return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
    }
  }
  return "";
}

function locationOf(
  violation: GuardViolation,
  fullPage: string,
  feedSummary: string,
  title: string,
): Where[] {
  const where: Where[] = [];
  // Digit tokens need word-boundary matching like the guard itself: a
  // substring probe would "find" the token 7 inside 70% or 2027 and turn
  // a genuine number fabrication into a false FP verdict.
  const locate = (text: string): boolean => {
    if (violation.kind === "number") {
      if (!text) return false;
      const bare = violation.token.replace(/,/g, "");
      const pattern = new RegExp(
        `(?<![\\d.])${bare.replace(/\\./g, "\\\\.")}(?![\\d])`,
      );
      return pattern.test(text.replace(/,/g, ""));
    }
    return looseContains(violation.token, text);
  };
  // Page beyond the excerpt first (same document, cut by the 6000 limit).
  if (locate(fullPage)) {
    where.push("other part of the page (beyond the excerpt)");
  }
  if (locate(feedSummary)) where.push("feed summary");
  if (locate(title)) where.push("title");
  return where;
}

function exitAfterFlush(code: number): void {
  setTimeout(() => process.exit(code), 250);
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  }
  const db = createClient(supabaseUrl, serviceKey);

  const { data, error } = await db
    .from("articles")
    .select("id, url, title, summary_bullets, why_it_matters")
    .order("published_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as StoredRow[];

  // One feed fetch for every row's feed summary (what the model saw when a
  // page fetch failed at generation time).
  const feedItems = await new RssAdapter(FEEDS).fetch();
  const feedByNormalizedUrl = new Map<string, string>();
  for (const item of feedItems) {
    const normalized = normalizeUrl(item.url);
    if (normalized) feedByNormalizedUrl.set(normalized, item.summary ?? "");
  }

  let checked = 0;
  let flagged = 0;
  let real = 0;
  let falsePositives = 0;
  let unverifiable = 0;

  log("title | unsupported token(s) | where the token appears | verdict");

  for (const row of rows) {
    const output = summaryOutputText(
      bulletsOf(row),
      typeof row.why_it_matters === "string" ? row.why_it_matters : "",
    );

    const fullPage = await fetchFullPageText(row.url);
    const feedRaw = feedByNormalizedUrl.get(normalizeUrl(row.url) ?? "") ?? "";
    const feedSummary = feedRaw ? stripTags(feedRaw) : "";
    const excerpt = fullPage
      ? fullPage.slice(0, MAX_TEXT_CHARS)
      : feedSummary || row.title; // mirror of extractArticleText's fallback
    checked++;

    // Same flag basis the pipeline/audit enforce (see guardBasis).
    const violations = findViolations(
      output,
      guardBasis(excerpt, fullPage, feedSummary, row.title),
    );
    if (violations.length === 0) continue;
    flagged++;

    const details = violations.map((violation) => {
      const where = locationOf(violation, fullPage, feedSummary, row.title);
      const pieces: string[] = [];
      if (where.length === 0) pieces.push("nowhere");
      for (const place of where) {
        const snippet =
          place === "feed summary"
            ? evidence(violation.token, feedSummary)
            : place === "title"
              ? evidence(violation.token, row.title)
              : evidence(violation.token, fullPage);
        pieces.push(`${place}${snippet ? ` [“${snippet}”]` : ""}`);
      }
      return { token: violation.token, where, pieces };
    });

    const allLocatable = details.every((detail) => detail.where.length > 0);
    // Without the page we cannot prove absence — the model may have seen it
    // at generation time, so "nowhere" must not become a REAL verdict.
    const pageUnreachable = !fullPage;
    let verdict: string;
    if (allLocatable) {
      falsePositives++;
      verdict = "FALSE POSITIVE (guard too strict)";
    } else if (pageUnreachable) {
      unverifiable++;
      verdict = "UNVERIFIABLE (page unreachable, cannot prove absence)";
    } else {
      real++;
      verdict = "REAL (not in the source)";
    }

    log("");
    log(`title:   ${row.title}`);
    log(`url:     ${row.url}`);
    log(
      `tokens:  ${details.map((detail) => `"${detail.token}"`).join(", ")}`,
    );
    for (const detail of details) {
      log(`where:   "${detail.token}" → ${detail.pieces.join("; ")}`);
    }
    log(`verdict: ${verdict}`);
  }

  log("");
  log(
    `checked=${checked} flagged=${flagged} real=${real} false_positive=${falsePositives} unverifiable=${unverifiable}`,
  );
}

main()
  .then(() => exitAfterFlush(0))
  .catch((error) => {
    log(
      `diagnosis failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    exitAfterFlush(1);
  });
