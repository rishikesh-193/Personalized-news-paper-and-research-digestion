/**
 * Does what was ingested actually reach a reader's Today page?
 *
 * Replays the EXACT query `src/app/(app)/today/page.tsx` runs for a given set
 * of interests — same columns, same hierarchy expansion
 * (expandInterests), same 7-day window, same limit — and reports how many
 * stories each reader would see. Read-only; never writes.
 *
 *   npx tsx scripts/ingest/check-today.ts                    # sample interest sets
 *   npx tsx scripts/ingest/check-today.ts Technology AI      # one interest set
 *   npx tsx scripts/ingest/check-today.ts --json             # machine-readable
 *
 * Use it to separate "the feeds never supplied this" from "the feeds supplied
 * it but the pipeline could not store it" — the per-category `offered` counts
 * in the ingestion report answer the first half.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

import { createClient } from "@supabase/supabase-js";
import { expandInterests } from "../../src/lib/topic-groups";

/** Mirrors the Today page: articles within this window, newest first. */
const WINDOW_DAYS = 7;
const LIMIT = 60;

const SAMPLE_SETS: Array<[string, string[]]> = [
  ["Technology only", ["Technology"]],
  ["AI + Programming", ["AI", "Programming"]],
  ["Sports (broad)", ["Sports"]],
  ["Gaming (broad)", ["Gaming"]],
  ["Cricket only", ["Cricket"]],
  ["India + World", ["India", "World"]],
  ["a 6-topic reader", ["Technology", "AI", "Sports", "Gaming", "Culture", "Cybersecurity"]],
];

interface Options {
  interests: string[] | null;
  json: boolean;
}

function parseArgs(argv: string[]): Options {
  const json = argv.includes("--json");
  const interests = argv.filter((arg) => !arg.startsWith("--"));
  return { interests: interests.length > 0 ? interests : null, json };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required",
    );
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const sets = options.interests
    ? ([["requested", options.interests]] as Array<[string, string[]]>)
    : SAMPLE_SETS;

  const results: Array<Record<string, unknown>> = [];
  for (const [label, interests] of sets) {
    const tags = expandInterests(interests);
    const { data, error } = await db
      .from("articles")
      .select("id, topic_tag, title")
      .in("topic_tag", tags)
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(LIMIT);

    if (error) throw new Error(`${label}: ${error.message}`);

    const topics: Record<string, number> = {};
    for (const row of data ?? []) {
      const topic = row.topic_tag == null ? "(null)" : String(row.topic_tag);
      topics[topic] = (topics[topic] ?? 0) + 1;
    }
    results.push({
      label,
      interests,
      matchedTags: tags,
      stories: data?.length ?? 0,
      topics,
    });
  }

  if (options.json) {
    console.log(JSON.stringify({ windowDays: WINDOW_DAYS, results }, null, 2));
    return;
  }

  console.log(
    `Today feed check — last ${WINDOW_DAYS} days, limit ${LIMIT}, ` +
      `topic matching expanded exactly as the Today page does:\n`,
  );
  for (const result of results) {
    const topics = Object.entries(result.topics as Record<string, number>)
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => `${topic}(${count})`)
      .join(" ");
    const stories = result.stories as number;
    const flag = stories === 0 ? "  ← reader would see an empty edition" : "";
    console.log(
      `${(result.label as string).padEnd(20)} stories ${String(stories).padStart(2)}  ` +
        `${topics || "(none)"}${flag}`,
    );
  }
}

main().catch((error) => {
  console.error(
    `[check-today] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
