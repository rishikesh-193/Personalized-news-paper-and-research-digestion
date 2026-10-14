import { test } from "node:test";
import assert from "node:assert/strict";

import { ENABLED_FEEDS, FEEDS, sourceId } from "../scripts/ingest/feeds";
import {
  FALLBACK_TOPIC,
  SUBTOPIC_LABELS,
  classifySubtopic,
  resolveTopic,
} from "../scripts/ingest/classify";
import { allocateFairly, orderWithinCategory } from "../scripts/ingest/allocate";
import { RssAdapter } from "../scripts/ingest/adapters/rss";
import type { RawItem } from "../scripts/ingest/adapters/types";
import { TOPIC_LABELS } from "../scripts/ingest/schema";
import {
  ALL_TOPICS,
  expandInterests,
  topicsForInterest,
} from "../src/lib/topic-groups";

// ---------------------------------------------------------------------------
// Feed registry integrity
// ---------------------------------------------------------------------------

test("every feed declares a canonical onboarding topic", () => {
  const known = new Set<string>(TOPIC_LABELS);
  for (const feed of FEEDS) {
    assert.ok(
      known.has(feed.topic),
      `${feed.source} declares "${feed.topic}", which is not in TOPIC_LABELS`,
    );
  }
});

test("the ingestion vocabulary and the onboarding vocabulary are the same list", () => {
  // A topic a reader can pick must be a topic ingestion can store, or the
  // reader can never receive anything for it.
  assert.deepEqual([...TOPIC_LABELS].sort(), [...ALL_TOPICS].sort());
});

test("every onboarding topic has at least one enabled feed", () => {
  const covered = new Set(ENABLED_FEEDS.map((feed) => feed.topic));
  const missing = ALL_TOPICS.filter((topic) => !covered.has(topic));
  assert.deepEqual(missing, [], `topics with no source: ${missing.join(", ")}`);
});

test("feed URLs are unique so two entries cannot fight over the same articles", () => {
  const seen = new Map<string, string>();
  for (const feed of FEEDS) {
    const previous = seen.get(feed.url);
    assert.equal(
      previous,
      undefined,
      `${feed.url} is listed twice (${previous} and ${feed.topic}/${feed.source})`,
    );
    seen.set(feed.url, `${feed.topic}/${feed.source}`);
  }
});

test("enabled feeds declare subtopics that exist in their topic's vocabulary", () => {
  for (const feed of ENABLED_FEEDS) {
    assert.ok(
      feed.subtopics && feed.subtopics.length > 0,
      `${feed.topic}/${feed.source} has no subtopics`,
    );
    const vocabulary = SUBTOPIC_LABELS[feed.topic];
    assert.ok(vocabulary, `${feed.topic} has no subtopic vocabulary`);
    for (const subtopic of feed.subtopics) {
      assert.ok(
        vocabulary.includes(subtopic),
        `${feed.topic}/${feed.source} declares unknown subtopic "${subtopic}"`,
      );
    }
  }
});

test("every source has a unique stable identifier for the run report", () => {
  // The Guardian appears 14 times under different topics, so a report line
  // naming only the publisher would be ambiguous.
  const seen = new Map<string, string>();
  for (const feed of FEEDS) {
    const id = sourceId(feed);
    assert.ok(id.length > 0, `${feed.url} produced an empty id`);
    assert.equal(seen.get(id), undefined, `duplicate source id "${id}"`);
    seen.set(id, feed.url);
  }
  // A repeat publisher must still resolve to distinct ids per feed.
  const guardian = FEEDS.filter((feed) => feed.source === "The Guardian");
  assert.ok(guardian.length > 1, "expected several Guardian feeds");
  assert.equal(
    new Set(guardian.map((feed) => sourceId(feed))).size,
    guardian.length,
    "Guardian feeds collapsed onto the same id",
  );
});

test("source ids are derived, stable and readable", () => {
  assert.equal(
    sourceId({ url: "https://www.theguardian.com/world/rss" }),
    "theguardian-world",
  );
  // "news" is a generic section segment, dropped so the id stays meaningful
  // ("rss", "feed", "index" are dropped for the same reason).
  assert.equal(
    sourceId({ url: "https://feeds.bbci.co.uk/news/world/rss.xml" }),
    "bbci-world",
  );
  // Deterministic: same input, same id, run after run.
  assert.equal(
    sourceId({ url: "https://example.org/feed" }),
    sourceId({ url: "https://example.org/feed" }),
  );
  // An explicit override wins.
  assert.equal(sourceId({ id: "custom", url: "https://example.org/feed" }), "custom");
  // A malformed URL must still produce something reportable.
  assert.ok(sourceId({ url: "not a url" }).length > 0);
});

test("parked feeds carry a reason, so a known-bad URL is not silently re-added", () => {
  for (const feed of FEEDS.filter((f) => f.enabled === false)) {
    assert.ok(
      feed.note && feed.note.length > 10,
      `${feed.source} is parked without an explanatory note`,
    );
  }
});

test("the registry is meaningfully broader than the pre-expansion list", () => {
  // The audit that motivated this work found 24 feeds across 16 topics.
  assert.ok(ENABLED_FEEDS.length >= 100, `only ${ENABLED_FEEDS.length} enabled feeds`);
});

test("hot categories have several independently operated sources", () => {
  for (const topic of ["Gaming", "Sports", "Cricket", "Football", "Technology", "AI"]) {
    const sources = ENABLED_FEEDS.filter((feed) => feed.topic === topic);
    const publishers = new Set(sources.map((feed) => feed.source));
    assert.ok(
      publishers.size >= 3,
      `${topic} has only ${publishers.size} publisher(s)`,
    );
  }
});

// ---------------------------------------------------------------------------
// Deterministic topic + subtopic mapping
// ---------------------------------------------------------------------------

test("a feed's declared topic is used verbatim when canonical", () => {
  assert.equal(resolveTopic("Cricket"), "Cricket");
  assert.equal(resolveTopic("Sports"), "Sports");
});

test("an unknown topic falls back instead of creating an unreachable category", () => {
  assert.equal(resolveTopic("Sportz"), FALLBACK_TOPIC);
  assert.ok(TOPIC_LABELS.includes(FALLBACK_TOPIC as (typeof TOPIC_LABELS)[number]));
});

test("sports headlines are distinguished by discipline", () => {
  const cases: Array<[string, string]> = [
    ["India beat Australia in a Test cricket thriller", "Cricket"],
    ["Manchester United sign a new striker before deadline day", "Football"],
    ["Verstappen wins the Grand Prix after a late pit stop", "Formula 1"],
    ["Wimbledon: Djokovic advances to the final", "Tennis"],
    ["BWF World Championships: Sindhu wins gold", "Badminton"],
    ["Carlsen defends his chess title in a tiebreak", "Chess"],
    ["NBA finals: the Celtics take game five", "Basketball"],
    ["Valorant Champions: the esports final breaks viewership records", "Esports"],
  ];
  for (const [title, expected] of cases) {
    assert.equal(classifySubtopic("Sports", title, []), expected, title);
  }
});

test("gaming headlines are distinguished by platform, release, review and industry", () => {
  const cases: Array<[string, string]> = [
    ["Sony sets a PlayStation State of Play for next week", "PlayStation"],
    ["Xbox Game Pass adds three titles this month", "Xbox"],
    ["Nintendo confirms a Switch 2 release date", "Nintendo"],
    ["The best mobile games to play right now", "Mobile"],
    ["Review: the sequel is a beautiful mess", "Reviews"],
    ["A new patch fixes the game's worst bugs", "Updates"],
    ["The studio announces layoffs across two teams", "Industry"],
    ["A Steam sale cuts prices on thousands of PC games", "PC"],
  ];
  for (const [title, expected] of cases) {
    assert.equal(classifySubtopic("Gaming", title, []), expected, title);
  }
});

test("a single-subtopic feed is authoritative over keyword guesses", () => {
  // Nintendo Life publishing a PlayStation story is still Nintendo coverage.
  assert.equal(
    classifySubtopic("Gaming", "PlayStation 5 gets a surprise port", ["Nintendo"]),
    "Nintendo",
  );
});

test("uncertain classification falls back rather than misclassifying", () => {
  assert.equal(classifySubtopic("Sports", "A quiet weekend in sport", []), "General");
  assert.equal(
    classifySubtopic("Sports", "A quiet weekend in sport", ["Cricket", "Football"]),
    "Cricket", // the feed's primary subtopic
  );
});

test("a declared subtopic outside the vocabulary is never emitted", () => {
  // Guard against a rule list drifting away from SUBTOPIC_LABELS.
  const result = classifySubtopic("Sports", "India win the cricket series", []);
  assert.ok(SUBTOPIC_LABELS.Sports.includes(result), result);
});

// ---------------------------------------------------------------------------
// Fair allocation
// ---------------------------------------------------------------------------

function item(topic: string, source: string, hoursOld: number, marker = ""): RawItem {
  return {
    url: `https://example.org/${topic}/${source}/${hoursOld}${marker}`,
    title: `${topic} ${source} ${hoursOld}${marker}`,
    publishedAt: new Date(Date.now() - hoursOld * 3_600_000),
    summary: "",
    source,
    topic,
  };
}

test("the budget rotates across categories before doubling up on any one", () => {
  const candidates = [
    ...Array.from({ length: 50 }, (_, i) => item("Technology", "Wire", i)),
    ...Array.from({ length: 5 }, (_, i) => item("Physics", "Journal", i)),
    ...Array.from({ length: 5 }, (_, i) => item("Cricket", "Cricinfo", i)),
  ];
  const { picked, perCategory } = allocateFairly(candidates, { cap: 6 });

  assert.equal(picked.length, 6);
  // The old feed-round-robin let the 50-item category dominate; every category
  // must now appear before any category appears twice.
  assert.equal(perCategory.Technology, 2);
  assert.equal(perCategory.Physics, 2);
  assert.equal(perCategory.Cricket, 2);
});

test("a prolific source cannot crowd other publishers out of its category", () => {
  const candidates = [
    ...Array.from({ length: 20 }, (_, i) => item("Gaming", "Polygon", i)),
    item("Gaming", "Nintendo Life", 1, "a"),
    item("Gaming", "Nintendo Life", 2, "b"),
    item("Gaming", "Push Square", 1, "c"),
    item("Gaming", "Push Square", 2, "d"),
  ];
  const { picked } = allocateFairly(candidates, { cap: 9 });
  const sources = picked.map((entry) => entry.source);

  // Every publisher with fresh items in the category is represented, and the
  // rotation starts immediately rather than draining the biggest queue first.
  assert.ok(sources.includes("Nintendo Life"), "Nintendo Life missing");
  assert.ok(sources.includes("Push Square"), "Push Square missing");
  assert.notEqual(sources[0], sources[1]);
  assert.notEqual(sources[1], sources[2]);

  // The deep queue may take the majority once the others run dry, but never
  // the whole slice.
  const polygon = sources.filter((s) => s === "Polygon").length;
  assert.ok(polygon < sources.length, "one publisher took the entire slice");
});

test("a source that runs dry lets the remaining sources continue", () => {
  const candidates = [
    ...Array.from({ length: 4 }, (_, i) => item("Gaming", "Polygon", i)),
    item("Gaming", "Nintendo Life", 1, "a"),
  ];
  const { picked } = allocateFairly(candidates, { cap: 4 });
  assert.deepEqual(
    picked.map((entry) => entry.source),
    ["Polygon", "Nintendo Life", "Polygon", "Polygon"],
  );
});

test("within a category the freshest story still leads", () => {
  const ordered = orderWithinCategory([
    item("AI", "Old Wire", 40),
    item("AI", "New Wire", 1),
  ]);
  assert.equal(ordered[0].source, "New Wire");
});

test("per-category ceiling is respected", () => {
  const candidates = Array.from({ length: 30 }, (_, i) => item("AI", "Wire", i));
  const { picked, perCategory } = allocateFairly(candidates, {
    cap: 20,
    perCategoryCap: 3,
  });
  assert.equal(picked.length, 3);
  assert.equal(perCategory.AI, 3);
});

test("allocation reports what it left on the table and is deterministic", () => {
  const candidates = [
    ...Array.from({ length: 4 }, (_, i) => item("AI", "Wire", i)),
    ...Array.from({ length: 4 }, (_, i) => item("Books", "Press", i)),
  ];
  const first = allocateFairly(candidates, { cap: 3 });
  const second = allocateFairly(candidates, { cap: 3 });
  assert.equal(first.overBudget, 5);
  assert.deepEqual(
    first.picked.map((entry) => entry.url),
    second.picked.map((entry) => entry.url),
  );
});

test("allocation handles empty input and a zero budget", () => {
  assert.deepEqual(allocateFairly([], { cap: 10 }).picked, []);
  const candidates = [item("AI", "Wire", 1)];
  const result = allocateFairly(candidates, { cap: 0 });
  assert.deepEqual(result.picked, []);
  assert.equal(result.overBudget, 1);
});

// ---------------------------------------------------------------------------
// Today feed: hierarchy-aware topic matching
// ---------------------------------------------------------------------------

test("a broad interest also matches its narrower topics", () => {
  const sports = topicsForInterest("Sports");
  for (const expected of ["Sports", "Cricket", "Football", "Motorsport", "Esports"]) {
    assert.ok(sports.includes(expected), `Sports should include ${expected}`);
  }
  assert.ok(topicsForInterest("Gaming").includes("Esports"));
});

test("narrow interests are not broadened", () => {
  // Picking Cricket must not silently pull in all of Sports.
  assert.deepEqual(topicsForInterest("Cricket"), ["Cricket"]);
  // Picking Technology must not expand into the whole technology group.
  assert.deepEqual(topicsForInterest("Technology"), ["Technology"]);
});

test("expanded interests are de-duplicated", () => {
  const expanded = expandInterests(["Sports", "Cricket", "Gaming", "Esports"]);
  assert.equal(new Set(expanded).size, expanded.length);
  assert.ok(expanded.includes("Cricket"));
  assert.ok(expanded.includes("Esports"));
});

// ---------------------------------------------------------------------------
// Feed parsing, failure isolation and bounded retries
// ---------------------------------------------------------------------------

const RSS_SAMPLE = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example</title>
    <item>
      <title>Apple&#8217;s new chip</title>
      <link>https://example.org/a</link>
      <pubDate>Mon, 13 Oct 2026 10:00:00 GMT</pubDate>
      <description>Something happened.</description>
    </item>
    <item>
      <title>Undated entry</title>
      <link>https://example.org/b</link>
      <description>No date at all.</description>
    </item>
  </channel>
</rss>`;

/** Replaces global fetch for one test, recording every URL it was asked for. */
async function withStubbedFetch(
  handler: (url: string) => { status: number; body: string } | Error,
  run: (calls: string[]) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const result = handler(url);
    if (result instanceof Error) throw result;
    return new Response(result.body, { status: result.status });
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("a feed is parsed, entities decoded, and undated items reported", async () => {
  await withStubbedFetch(
    () => ({ status: 200, body: RSS_SAMPLE }),
    async () => {
      const { items, sources } = await new RssAdapter([
        { topic: "Technology", source: "Example", url: "https://example.org/feed" },
      ]).fetch();

      assert.equal(items.length, 2);
      assert.equal(items[0].title, "Apple’s new chip");
      assert.ok(items[0].publishedAt instanceof Date);
      assert.equal(items[1].publishedAt, null); // dropped later by freshness
      assert.equal(sources.length, 1);
      assert.equal(sources[0].outcome, "ok");
      assert.equal(sources[0].entries, 2);
      assert.equal(sources[0].dated, 1);
    },
  );
});

test("one failing feed does not fail the whole fetch", async () => {
  await withStubbedFetch(
    (url) =>
      url.includes("bad")
        ? { status: 404, body: "" }
        : { status: 200, body: RSS_SAMPLE },
    async () => {
      const { items, sources } = await new RssAdapter([
        { topic: "Technology", source: "Good", url: "https://example.org/good" },
        { topic: "Science", source: "Bad", url: "https://example.org/bad" },
      ]).fetch();

      assert.equal(items.length, 2); // the working feed still contributed
      const outcomes = Object.fromEntries(
        sources.map((source) => [source.source, source.outcome]),
      );
      assert.equal(outcomes.Good, "ok");
      assert.equal(outcomes.Bad, "error");
      const bad = sources.find((source) => source.source === "Bad");
      assert.match(bad?.error ?? "", /404/);
    },
  );
});

test("a malformed body is reported as a feed error, not a crash", async () => {
  await withStubbedFetch(
    () => ({ status: 200, body: "<html><body>not a feed</body></html>" }),
    async () => {
      const { items, sources } = await new RssAdapter([
        { topic: "Technology", source: "Broken", url: "https://example.org/broken" },
      ]).fetch();
      assert.equal(items.length, 0);
      assert.equal(sources[0].outcome, "error");
      assert.ok(sources[0].error);
    },
  );
});

test("transient 5xx responses are retried, then reported", async () => {
  await withStubbedFetch(
    () => ({ status: 503, body: "" }),
    async (calls) => {
      const { sources } = await new RssAdapter([
        { topic: "Technology", source: "Flaky", url: "https://example.org/flaky" },
      ]).fetch();
      // 1 original attempt + 2 bounded retries.
      assert.equal(calls.length, 3);
      assert.equal(sources[0].outcome, "error");
      assert.match(sources[0].error ?? "", /503/);
    },
  );
});

test("network errors are retried and surfaced", async () => {
  await withStubbedFetch(
    () => new Error("socket hang up"),
    async (calls) => {
      const { sources } = await new RssAdapter([
        { topic: "Technology", source: "Offline", url: "https://example.org/offline" },
      ]).fetch();
      assert.equal(calls.length, 3);
      assert.equal(sources[0].outcome, "error");
      assert.match(sources[0].error ?? "", /socket hang up/);
    },
  );
});

test("a feed with no items is reported as empty, not failed", async () => {
  await withStubbedFetch(
    () => ({ status: 200, body: '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>' }),
    async () => {
      const { sources } = await new RssAdapter([
        { topic: "Technology", source: "Quiet", url: "https://example.org/quiet" },
      ]).fetch();
      assert.equal(sources[0].outcome, "empty");
      assert.equal(sources[0].error, null);
    },
  );
});
