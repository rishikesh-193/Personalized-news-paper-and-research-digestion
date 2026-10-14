/**
 * Chronicle ingestion — coverage audit (read-only).
 *
 * Answers "why is coverage thin?" with evidence instead of guessing:
 *
 *   npx tsx scripts/ingest/audit.ts                  probe feeds + report DB coverage
 *   npx tsx scripts/ingest/audit.ts --db             stored-article coverage only
 *   npx tsx scripts/ingest/audit.ts --feeds          feed probe only
 *   npx tsx scripts/ingest/audit.ts --feeds --all    probe every URL, ignore enabled flag
 *   npx tsx scripts/ingest/audit.ts --json           machine-readable output
 *
 * Never writes to the database and never prints secret values.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

import { FEEDS, type FeedConfig } from "./feeds";
import { createDb } from "./db";
import { TOPIC_LABELS } from "./schema";
import { ALL_TOPICS } from "../../src/lib/topic-groups";
import { fetchWithTimeout, log, runPool } from "./util";

const FEED_PROBE_CONCURRENCY = 8;
const PAGE_SIZE = 1_000;
/** Items older than this make a feed "stale" for daily-cadence purposes. */
const STALE_DAYS = 14;

interface FeedProbe {
  topic: string;
  source: string;
  url: string;
  outcome: "ok" | "empty" | "error" | "disabled";
  /** Number of <item>/<entry> elements in the response. */
  items: number;
  /** Age in days of the newest dated item the feed exposed. */
  newestAgeDays: number | null;
  /** Whether the body looks like RSS/Atom at all. */
  looksLikeFeed: boolean;
  error: string | null;
}

interface Options {
  feeds: boolean;
  db: boolean;
  all: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { feeds: false, db: false, all: false, json: false };
  for (const arg of argv) {
    if (arg === "--feeds") options.feeds = true;
    else if (arg === "--db") options.db = true;
    else if (arg === "--all") options.all = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`Unknown flag "${arg}"`);
  }
  // No selector means everything.
  if (!options.feeds && !options.db) {
    options.feeds = true;
    options.db = true;
  }
  return options;
}

function isEnabled(feed: FeedConfig): boolean {
  return feed.enabled !== false;
}

/** Counts <item>/<entry> elements without pulling in a full XML parser. */
function countEntries(body: string): number {
  return (
    (body.match(/<item[\s>]/gi) ?? []).length +
    (body.match(/<entry[\s>]/gi) ?? []).length
  );
}

/**
 * Newest <pubDate>/<updated>/<published> value in the body, in days of age.
 * Regex-scoped on purpose: a malformed feed must not abort the probe.
 */
function newestItemAgeDays(body: string, now: number): number | null {
  const dates = [
    ...body.matchAll(
      /<(?:pubDate|published|updated|dc:date)>([^<]+)<\/(?:pubDate|published|updated|dc:date)>/gi,
    ),
  ]
    .map((match) => Date.parse(match[1].trim()))
    .filter((time) => Number.isFinite(time));
  if (dates.length === 0) return null;
  return (now - Math.max(...dates)) / 86_400_000;
}

async function probeFeed(feed: FeedConfig, now: number): Promise<FeedProbe> {
  const base = {
    topic: feed.topic,
    source: feed.source,
    url: feed.url,
    enabled: isEnabled(feed),
  } as const;
  try {
    const response = await fetchWithTimeout(feed.url, 20_000, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    const body = await response.text();
    const items = countEntries(body);
    const looksLikeFeed = /<(?:rss|feed|channel)[\s>]/i.test(body);
    return {
      ...base,
      outcome: items > 0 ? "ok" : "empty",
      items,
      newestAgeDays: newestItemAgeDays(body, now),
      looksLikeFeed,
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      outcome: "error",
      items: 0,
      newestAgeDays: null,
      looksLikeFeed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

interface CoverageRow {
  topic: string;
  total: number;
  last3d: number;
  last7d: number;
  newestAgeHours: number | null;
  sources: Set<string>;
}

async function readCoverage(): Promise<{
  total: number;
  rows: CoverageRow[];
  window: { last3d: number; last7d: number };
} | null> {
  const db = createDb();
  if (!db) return null;

  const now = Date.now();
  const perTopic = new Map<string, CoverageRow>();
  const rowFor = (topic: string): CoverageRow => {
    let row = perTopic.get(topic);
    if (!row) {
      row = { topic, total: 0, last3d: 0, last7d: 0, newestAgeHours: null, sources: new Set() };
      perTopic.set(topic, row);
    }
    return row;
  };

  let total = 0;
  let window3d = 0;
  let window7d = 0;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("articles")
      .select("topic_tag, published_at, source_name")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(
        `[audit] could not read articles (${error.code ?? "error"}: ${error.message})`,
      );
      return null;
    }

    for (const row of data ?? []) {
      total++;
      const topic = row.topic_tag == null ? "(null)" : String(row.topic_tag);
      const entry = rowFor(topic);
      entry.total++;
      if (row.source_name) entry.sources.add(String(row.source_name));

      const time = row.published_at ? Date.parse(String(row.published_at)) : NaN;
      if (Number.isFinite(time)) {
        const ageDays = (now - time) / 86_400_000;
        if (ageDays <= 3) {
          entry.last3d++;
          window3d++;
        }
        if (ageDays <= 7) {
          entry.last7d++;
          window7d++;
        }
        const ageHours = (now - time) / 3_600_000;
        if (entry.newestAgeHours === null || ageHours < entry.newestAgeHours) {
          entry.newestAgeHours = ageHours;
        }
      }
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  const rows = [...perTopic.values()].sort(
    (a, b) => b.total - a.total || a.topic.localeCompare(b.topic),
  );
  return { total, rows, window: { last3d: window3d, last7d: window7d } };
}

function formatAge(days: number | null): string {
  if (days === null) return "   n/a";
  if (days < 1) return `${(days * 24).toFixed(0)}h`.padStart(6);
  return `${days.toFixed(1)}d`.padStart(6);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const now = Date.now();

  const probeTargets = options.all ? FEEDS : FEEDS.filter(isEnabled);
  let probes: FeedProbe[] = [];
  if (options.feeds) {
    log(`probing ${probeTargets.length}/${FEEDS.length} configured feeds…`);
    const collected: FeedProbe[] = [];
    await runPool(probeTargets, FEED_PROBE_CONCURRENCY, async (feed) => {
      collected.push(await probeFeed(feed, now));
    });
    probes = collected.sort(
      (a, b) => a.topic.localeCompare(b.topic) || a.source.localeCompare(b.source),
    );
  }

  const coverage = options.db ? await readCoverage() : null;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date(now).toISOString(),
          feeds: {
            configured: FEEDS.length,
            enabled: FEEDS.filter(isEnabled).length,
            probed: probes.length,
            ok: probes.filter((p) => p.outcome === "ok").length,
            empty: probes.filter((p) => p.outcome === "empty").length,
            errors: probes.filter((p) => p.outcome === "error").length,
            stale: probes.filter((p) => p.newestAgeDays !== null && p.newestAgeDays > STALE_DAYS)
              .length,
            detail: probes,
          },
          coverage:
            coverage === null
              ? null
              : {
                  total: coverage.total,
                  window: coverage.window,
                  rows: coverage.rows.map((row) => ({
                    topic: row.topic,
                    total: row.total,
                    last3d: row.last3d,
                    last7d: row.last7d,
                    newestAgeHours: row.newestAgeHours,
                    sources: [...row.sources],
                  })),
                },
        },
        null,
        2,
      ),
    );
    return;
  }

  if (options.feeds) {
    const ok = probes.filter((p) => p.outcome === "ok").length;
    const empty = probes.filter((p) => p.outcome === "empty").length;
    const errors = probes.filter((p) => p.outcome === "error").length;
    log("");
    log(`FEED PROBE — ${probes.length} probed: ${ok} ok, ${empty} empty, ${errors} failed`);
    log("outcome  items  newest  topic / source");
    for (const probe of probes) {
      const flags = [
        probe.outcome === "ok" ? "ok     " : probe.outcome.padEnd(7),
        String(probe.items).padStart(5),
        formatAge(probe.newestAgeDays),
      ].join(" ");
      log(`${flags}  ${probe.topic} / ${probe.source}`);
      if (probe.outcome === "error") log(`         └ ${probe.error}`);
      else if (!probe.looksLikeFeed) log("         └ body is not RSS/Atom");
      else if (probe.newestAgeDays !== null && probe.newestAgeDays > STALE_DAYS) {
        log(`         └ stale: newest item is ${probe.newestAgeDays.toFixed(0)} days old`);
      }
    }
    const covered = new Set(probes.filter((p) => p.outcome === "ok").map((p) => p.topic));
    const missing = ALL_TOPICS.filter((topic) => !covered.has(topic));
    log("");
    log(
      `topics with a WORKING feed: ${covered.size}/${ALL_TOPICS.length}` +
        (missing.length > 0 ? ` — no working feed for: ${missing.join(", ")}` : ""),
    );
  }

  if (coverage === null) {
    if (options.db) logErrorLine("no database access — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing");
    return;
  }

  const definedTopics = new Set(TOPIC_LABELS as readonly string[]);
  const unknown = coverage.rows.filter((row) => !definedTopics.has(row.topic));
  log("");
  log(
    `STORED COVERAGE — ${coverage.total} articles total, ` +
      `${coverage.window.last3d} in the last 3 days, ${coverage.window.last7d} in the last 7 days`,
  );
  log("total  last3d  last7d  newest  sources  topic");
  for (const row of coverage.rows) {
    log(
      [
        String(row.total).padStart(5),
        String(row.last3d).padStart(7),
        String(row.last7d).padStart(7),
        formatAge(row.newestAgeHours === null ? null : row.newestAgeHours / 24),
        String(row.sources.size).padStart(8),
        " ",
        row.topic,
      ].join(" "),
    );
  }
  if (unknown.length > 0) {
    log("");
    log(
      `topics stored but NOT in the onboarding vocabulary: ${unknown
        .map((row) => row.topic)
        .join(", ")}`,
    );
  }

  const storedTopics = new Set(coverage.rows.map((row) => row.topic));
  const absent = ALL_TOPICS.filter((topic) => !storedTopics.has(topic));
  const thin = coverage.rows
    .filter((row) => definedTopics.has(row.topic) && row.last7d === 0)
    .map((row) => row.topic);
  log("");
  log(
    `onboarding topics with ZERO stored articles: ${absent.length}/${ALL_TOPICS.length}` +
      (absent.length > 0 ? ` — ${absent.join(", ")}` : ""),
  );
  log(
    `onboarding topics with nothing in the last 7 days: ${thin.length}` +
      (thin.length > 0 ? ` — ${thin.join(", ")}` : ""),
  );
}

function logErrorLine(message: string): void {
  console.error(`[ingest] ${message}`);
}

main().catch((error) => {
  console.error(`[audit] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
