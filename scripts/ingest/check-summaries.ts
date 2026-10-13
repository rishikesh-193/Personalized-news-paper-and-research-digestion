/**
 * Read-only audit — reports how many STORED summaries fail the source-text
 * guard (see guard.ts) against the full legitimate basis: the excerpt the
 * model saw, the full page text (beyond the 6000-char cut), the feed
 * summary, and the title.
 *
 *   npx tsx scripts/ingest/check-summaries.ts
 *
 * Never writes to the database and never modifies articles.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

import { createClient } from "@supabase/supabase-js";
import { RssAdapter } from "./adapters/rss";
import { FEEDS } from "./feeds";
import { MAX_TEXT_CHARS, extractArticleText, stripTags } from "./extract";
import { findViolations, guardBasis, summaryOutputText } from "./guard";
import { log, logError, normalizeUrl } from "./util";

interface StoredRow {
  id: string;
  url: string;
  title: string;
  summary_bullets: unknown;
  why_it_matters: unknown;
}

function bulletsOf(row: StoredRow): string[] {
  return Array.isArray(row.summary_bullets)
    ? row.summary_bullets.filter(
        (bullet): bullet is string => typeof bullet === "string",
      )
    : [];
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

  // Feed summaries are part of the legitimate source basis (they can be
  // what the model saw when a page fetch failed at generation time).
  const feedItems = await new RssAdapter(FEEDS).fetch();
  const feedByNormalizedUrl = new Map<string, string>();
  for (const item of feedItems) {
    const normalized = normalizeUrl(item.url);
    if (normalized) feedByNormalizedUrl.set(normalized, item.summary ?? "");
  }

  let checked = 0;
  let wouldFail = 0;
  let unverifiable = 0;

  for (const row of rows) {
    const output = summaryOutputText(
      bulletsOf(row),
      typeof row.why_it_matters === "string" ? row.why_it_matters : "",
    );

    const { fullPage } = await extractArticleText(row.url, "", row.title);
    const feedRaw = feedByNormalizedUrl.get(normalizeUrl(row.url) ?? "") ?? "";
    const feedSummary = feedRaw ? stripTags(feedRaw) : "";

    if (!fullPage && !feedSummary) {
      unverifiable++;
      log(`unverifiable (page and feed both unavailable): ${row.url}`);
      continue;
    }

    checked++;
    const basis = guardBasis(
      fullPage ? fullPage.slice(0, MAX_TEXT_CHARS) : feedSummary || row.title,
      fullPage,
      feedSummary,
      row.title,
    );
    const violations = findViolations(output, basis);
    if (violations.length > 0) {
      wouldFail++;
      log(`WOULD FAIL: ${row.title}`);
      log(`  ${row.url}`);
      for (const violation of violations) {
        log(`  [${violation.kind}] "${violation.token}"`);
      }
    }
  }

  log(
    `checked=${checked} would_fail=${wouldFail} unverifiable=${unverifiable} total=${rows.length}`,
  );
}

main()
  .then(() => exitAfterFlush(0))
  .catch((error) => {
    logError(error instanceof Error ? error.message : String(error));
    exitAfterFlush(1);
  });
