import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  arxivIdFromAbsUrl,
  basisFor,
  canonicalUrl,
  dedupePapers,
  normalizeQuery,
  parseArxivAtom,
  type DiscoveredPaper,
} from "../src/lib/discovery/util";
import { briefSchemaFor } from "../src/lib/discovery/schema";
import {
  arxivSearchUrl,
  buildAllTermsQuery,
  buildExactPhraseQuery,
  canonicalizeArxivPaper,
  collectArxivResults,
  dedupeByArxivId,
  isUsableArxivResult,
  meaningfulTerms,
  stripArxivVersion,
  type ArxivRequest,
} from "../src/lib/discovery/arxiv";

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2405.12345v2</id>
    <published>2024-05-20T09:00:00Z</published>
    <title>Retrieval&#8217;s Effect on   Grounding</title>
    <summary>
      We study retrieval augmented generation for factual answers.
    </summary>
    <author><name>Ada Lovelace</name></author>
    <author><name>Alan Turing</name></author>
    <link href="http://arxiv.org/abs/2405.12345v2" rel="alternate" type="text/html"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2405.99999v1</id>
    <published>2024-06-01T00:00:00Z</published>
    <title>No Authors Here</title>
    <summary>An abstract.</summary>
    <link href="http://arxiv.org/abs/2405.99999v1" rel="alternate" type="text/html"/>
  </entry>
</feed>`;

test("arxiv ids lose their version suffix", () => {
  assert.equal(arxivIdFromAbsUrl("http://arxiv.org/abs/2405.12345v2"), "2405.12345");
  assert.equal(arxivIdFromAbsUrl("https://arxiv.org/abs/2405.12345"), "2405.12345");
  assert.equal(arxivIdFromAbsUrl("not-an-abs-url"), null);
});

test("query normalization is whitespace- and case-insensitive", () => {
  assert.equal(normalizeQuery("  Retrieval   Augmented\nGeneration "), "retrieval augmented generation");
});

test("canonical urls drop fragments, utm params and host case", () => {
  assert.equal(
    canonicalUrl("https://WWW.Example.org/story?utm_source=x&id=7#top"),
    "https://www.example.org/story?id=7",
  );
  assert.equal(canonicalUrl("not a url"), null);
});

test("arxiv Atom is parsed into papers with all authors and decoded titles", () => {
  const papers = parseArxivAtom(ATOM);
  assert.equal(papers.length, 2);

  const [first, second] = papers;
  assert.equal(first.kind, "paper");
  assert.equal(first.source, "arxiv");
  assert.equal(first.externalId, "2405.12345");
  assert.equal(first.url, "http://arxiv.org/abs/2405.12345v2");
  assert.equal(first.title, "Retrieval’s Effect on Grounding");
  assert.deepEqual(first.authors, ["Ada Lovelace", "Alan Turing"]);
  assert.equal(first.publishedAt, "2024-05-20");
  assert.match(first.abstract ?? "", /retrieval augmented generation/);

  assert.deepEqual(second.authors, []);
});

test("entries without an id or title are dropped", () => {
  const xml = `<feed><entry><summary>no id or title</summary></entry></feed>`;
  assert.deepEqual(parseArxivAtom(xml), []);
});

function item(over: Partial<DiscoveredPaper>): DiscoveredPaper {
  return {
    kind: "paper",
    source: "arxiv",
    externalId: "1",
    url: "https://arxiv.org/abs/1",
    title: "T",
    authors: [],
    abstract: null,
    publishedAt: null,
    ...over,
  };
}

test("dedupe drops missing title/url and repeats, keyed by id or canonical url", () => {
  const kept = dedupePapers([
    item({ externalId: "2405.1" }),
    item({ externalId: "2405.1", title: "duplicate id" }),
    item({ kind: "web", source: "tavily", url: "https://x.org/a?utm_source=q" }),
    item({ kind: "web", source: "tavily", url: "https://x.org/a" }),
    item({ title: "" }),
    item({ url: "" }),
  ]);

  assert.equal(kept.length, 2);
  assert.equal(kept[0].externalId, "2405.1");
  assert.equal(kept[1].externalId, "https://x.org/a");
});

test("basis labels distinguish abstracts from snippets", () => {
  assert.equal(basisFor("paper"), "abstract");
  assert.equal(basisFor("web"), "snippet");
});

test("brief schema enforces citations that map to real sources", () => {
  const schema = briefSchemaFor(3);
  const valid = {
    overview:
      "Retrieval improves grounding [1]. Larger indexes help [2]. Costs rise with size [3].",
    themes: ["grounding", "cost", "scale"],
    items: [
      {
        index: 1,
        objective: "o",
        finding: "f",
        method: null,
        limitation: null,
        relevance: "r",
      },
    ],
    basis: "three abstracts",
  };
  assert.equal(schema.safeParse(valid).success, true);

  // Citation outside the supplied range.
  assert.equal(
    schema.safeParse({ ...valid, overview: "Only claims [4]." }).success,
    false,
  );
  // Item index that maps to no supplied source.
  assert.equal(
    schema.safeParse({
      ...valid,
      items: [{ ...valid.items[0], index: 4 }],
    }).success,
    false,
  );
  // Duplicate indexes.
  assert.equal(
    schema.safeParse({
      ...valid,
      items: [valid.items[0], { ...valid.items[0] }],
    }).success,
    false,
  );
  // Too few themes.
  assert.equal(schema.safeParse({ ...valid, themes: ["a", "b"] }).success, false);
});

/* ==========================================================================
 * arXiv search relevance (search + fallback + canonical ids)
 * ======================================================================== */

/** A fake arXiv hit; the abstract is what makes it "usable". */
function hit(id: string, over: Partial<DiscoveredPaper> = {}): DiscoveredPaper {
  return {
    kind: "paper",
    source: "arxiv",
    externalId: id,
    url: `https://arxiv.org/abs/${id}v1`,
    title: `Paper ${id}`,
    authors: [],
    abstract: "An abstract long enough to summarize for the brief.",
    publishedAt: "2024-01-01",
    ...over,
  };
}

const PHRASE = "retrieval augmented generation";
const EXACT = '(ti:"retrieval augmented generation" OR abs:"retrieval augmented generation")';

test("multi-word searches query the exact phrase in title and abstract", () => {
  assert.equal(buildExactPhraseQuery(PHRASE), EXACT);
  // no bare `all:` search that would match a paper mentioning only "augmented"
  assert.ok(!EXACT.includes("all:"));
  assert.equal(
    buildExactPhraseQuery("  federated   learning "),
    '(ti:"federated learning" OR abs:"federated learning")',
  );
  // embedded quotes are escaped for arXiv's syntax
  assert.equal(
    buildExactPhraseQuery('the "best" one'),
    '(ti:"the \\"best\\" one" OR abs:"the \\"best\\" one")',
  );
});

test("the request URL is fully encoded and ranks by relevance", () => {
  const url = arxivSearchUrl(buildExactPhraseQuery(PHRASE), 10);
  assert.ok(url.startsWith("https://export.arxiv.org/api/query?search_query="));
  assert.ok(url.includes("&max_results=10"));
  assert.ok(url.includes("sortBy=relevance"));

  const encoded = url.split("&")[0].replace("search_query=", "");
  assert.ok(!/["\s]/.test(encoded), `raw quotes/spaces leaked into ${encoded}`);
  assert.equal(new URL(url).searchParams.get("search_query"), EXACT);
});

test("meaningful terms drop stop words and duplicates", () => {
  assert.deepEqual(meaningfulTerms("a study of the retrieval augmented generation"), [
    "study",
    "retrieval",
    "augmented",
    "generation",
  ]);
  assert.deepEqual(meaningfulTerms("the of and to"), []);
  assert.equal(buildAllTermsQuery("the of and to"), null);
  assert.equal(
    buildAllTermsQuery(PHRASE),
    '((ti:"retrieval" OR abs:"retrieval") AND (ti:"augmented" OR abs:"augmented") AND (ti:"generation" OR abs:"generation"))',
  );
});

test("fewer than five usable exact-phrase hits triggers the all-terms fallback", async () => {
  const calls: string[] = [];
  const request: ArxivRequest = async (searchQuery) => {
    calls.push(searchQuery);
    return searchQuery === EXACT ? [hit("1"), hit("2")] : [hit("3"), hit("4"), hit("5")];
  };

  const outcome = await collectArxivResults(PHRASE, request);
  assert.equal(outcome.usedFallback, true);
  assert.deepEqual(calls, [EXACT, buildAllTermsQuery(PHRASE) as string]);
  // exact-phrase hits stay ahead of the weaker all-terms matches
  assert.deepEqual(outcome.papers.map((paper) => paper.externalId), ["1", "2", "3", "4", "5"]);
});

test("five or more usable exact-phrase hits means no fallback request", async () => {
  const calls: string[] = [];
  const request: ArxivRequest = async (searchQuery) => {
    calls.push(searchQuery);
    return ["1", "2", "3", "4", "5", "6"].map((id) => hit(id));
  };

  const outcome = await collectArxivResults(PHRASE, request);
  assert.equal(outcome.usedFallback, false);
  assert.deepEqual(calls, [EXACT]);
  assert.equal(outcome.papers.length, 6);
});

test("hits with no abstract do not count as usable", async () => {
  const calls: string[] = [];
  const request: ArxivRequest = async (searchQuery) => {
    calls.push(searchQuery);
    return [hit("1", { abstract: "  " }), hit("2", { abstract: null }), hit("3")];
  };

  await collectArxivResults(PHRASE, request);
  assert.equal(calls.length, 2, "only one usable hit, so the fallback must run");
  assert.equal(isUsableArxivResult(hit("1")), true);
  assert.equal(isUsableArxivResult(hit("1", { abstract: null })), false);
});

test("a one-word search is not widened into a duplicate query", async () => {
  const calls: string[] = [];
  const request: ArxivRequest = async (searchQuery) => {
    calls.push(searchQuery);
    return [];
  };

  const outcome = await collectArxivResults("augmented", request);
  assert.deepEqual(calls, ['(ti:"augmented" OR abs:"augmented")']);
  assert.equal(outcome.usedFallback, false);
});

test("results are capped at ten even when both queries answer", async () => {
  const request: ArxivRequest = async (searchQuery) =>
    searchQuery === EXACT
      ? ["1", "2"].map((id) => hit(id))
      : Array.from({ length: 10 }, (_, index) => hit(`w${index}`));

  const outcome = await collectArxivResults(PHRASE, request);
  assert.equal(outcome.papers.length, 10);
});

test("deduplication collapses versions of the same paper, keeping the relevant hit", async () => {
  const v1 = hit("2506.06962", {
    url: "http://arxiv.org/abs/2506.06962v1",
    title: "Exact hit",
  });
  const v3 = hit("2506.06962v3", {
    url: "http://arxiv.org/abs/2506.06962v3",
    title: "Later revision",
  });

  const kept = dedupeByArxivId([v1, v3]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].externalId, "2506.06962");
  assert.equal(kept[0].url, "https://arxiv.org/abs/2506.06962");
  assert.equal(kept[0].title, "Exact hit");

  // …and across the two queries of one search: no duplicate, source link kept.
  const request: ArxivRequest = async (searchQuery) =>
    searchQuery === EXACT ? [v1] : [v3, hit("3333.3", { title: "Weak hit" })];
  const outcome = await collectArxivResults(PHRASE, request);
  assert.deepEqual(outcome.papers.map((paper) => paper.title), [
    "Exact hit",
    "Weak hit",
  ]);
  assert.deepEqual(outcome.papers.map((paper) => paper.url), [
    "https://arxiv.org/abs/2506.06962",
    "https://arxiv.org/abs/3333.3",
  ]);
});

test("canonical ids drop versions and keep a valid abstract url", () => {
  assert.equal(stripArxivVersion("2506.06962v12"), "2506.06962");
  assert.equal(stripArxivVersion("2506.06962"), "2506.06962");
  const canonical = canonicalizeArxivPaper(
    hit("2506.06962", { url: "http://arxiv.org/abs/2506.06962v3" }),
  );
  assert.equal(canonical.externalId, "2506.06962");
  assert.equal(canonical.url, "https://arxiv.org/abs/2506.06962");
  assert.equal(canonical.kind, "paper");
  assert.equal(canonical.source, "arxiv");
  assert.equal(canonical.publishedAt, "2024-01-01");
});

/* ==========================================================================
 * Service-role key must stay out of client bundles
 * ======================================================================== */

const SRC = join(process.cwd(), "src");
const ADMIN_MODULE = join(SRC, "lib/supabase/admin.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function isClientModule(file: string): boolean {
  return /^\s*["']use client["']/.test(readFileSync(file, "utf8"));
}

/**
 * Import specifiers of a module. `from "x"` also covers multi-line import
 * blocks and `export … from`; bare `import "x"` and dynamic `import("x")`
 * are matched separately. Specifiers inside comments or strings would only
 * ADD an edge, which can at worst make this check stricter, never looser.
 */
function importSpecifiers(source: string): string[] {
  const specs = new Set<string>();
  for (const match of source.matchAll(/from\s*["']([^"']+)["']/g)) {
    specs.add(match[1]);
  }
  for (const match of source.matchAll(/import\s*["']([^"']+)["']/g)) {
    specs.add(match[1]);
  }
  for (const match of source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    specs.add(match[1]);
  }
  return [...specs];
}

/** Resolves a workspace specifier to a file, or null for bare packages. */
function resolveSpecifier(spec: string, fromFile: string): string | null {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(fromFile), spec)
      : null;
  if (base === null) return null;

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every module reachable from a Client Component, following imports. */
function clientReachableModules(): Set<string> {
  const reachable = new Set<string>();
  const queue = sourceFiles(SRC).filter(isClientModule);

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (reachable.has(file)) continue;
    reachable.add(file);
    for (const spec of importSpecifiers(readFileSync(file, "utf8"))) {
      const resolved = resolveSpecifier(spec, file);
      if (resolved && !reachable.has(resolved)) queue.push(resolved);
    }
  }
  return reachable;
}

test("the admin client is guarded by `server-only` and reads only the secret key", () => {
  const source = readFileSync(ADMIN_MODULE, "utf8");
  assert.equal(
    source.split("\n")[0].trim(),
    'import "server-only";',
    "admin.ts must start with import \"server-only\"",
  );
  assert.ok(
    !/NEXT_PUBLIC_[A-Z_]*(SERVICE_ROLE|SECRET|ADMIN)/.test(source),
    "the secret key must not be read through a NEXT_PUBLIC_ variable",
  );
  assert.ok(
    source.includes("SUPABASE_SECRET_KEY") ||
      source.includes("SUPABASE_SERVICE_ROLE_KEY"),
    "admin.ts should read the server-side secret key",
  );
});

test("no Client Component reaches the admin module", () => {
  const clientFiles = sourceFiles(SRC).filter(isClientModule);
  assert.ok(clientFiles.length > 0, "expected to find Client Components to check");

  const reachable = clientReachableModules();
  const offenders = [...reachable].filter(
    (file) =>
      file === ADMIN_MODULE ||
      importSpecifiers(readFileSync(file, "utf8")).some((spec) =>
        spec.endsWith("supabase/admin"),
      ),
  );
  assert.deepEqual(offenders, [], `client bundle reaches: ${offenders.join(", ")}`);

  // The only importers must be the server route handlers.
  const importers = sourceFiles(SRC)
    .filter((file) =>
      importSpecifiers(readFileSync(file, "utf8")).some((spec) =>
        spec.endsWith("supabase/admin"),
      ),
    )
    .map((file) => relative(process.cwd(), file).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(importers, [
    "src/app/api/research/discover/brief/route.ts",
    "src/app/api/research/discover/search/route.ts",
  ]);
});
