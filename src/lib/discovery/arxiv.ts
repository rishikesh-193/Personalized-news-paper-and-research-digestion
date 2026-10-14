import { parseArxivAtom, type DiscoveredPaper } from "./util";

/**
 * arXiv API client (no key required).
 *
 * Relevance: a multi-word search runs as an EXACT PHRASE over title and
 * abstract first — `(ti:"retrieval augmented generation" OR
 * abs:"retrieval augmented generation")` — so a paper mentioning only
 * "augmented" is not returned. Only when that yields too few usable hits do
 * we widen to a query that requires every meaningful term to appear.
 *
 * Every request goes through `withArxivSlot`, so calls are serialized with
 * ≥3s spacing (arXiv's stated limit: one request every 3 seconds over a
 * single connection). When more requests are already queued than the policy
 * allows it throws `ArxivBusyError`, and the route answers "try again in a
 * few seconds" instead of breaching the limit. The guard is per server
 * instance — the best guarantee available in a serverless runtime.
 */

const ENDPOINT = "https://export.arxiv.org/api/query";
const MIN_INTERVAL_MS = 3_000;
/** Requests allowed to queue ahead of a new one before we report "busy". */
const MAX_QUEUED = 2;
const REQUEST_TIMEOUT_MS = 20_000;
/** At most this many results reach the caller. */
const MAX_RESULTS = 10;

/** Fewer usable exact-phrase hits than this and we widen the search. */
export const MIN_USABLE_RESULTS = 5;

/** Words that carry no search meaning on their own. */
const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "been", "but", "by",
  "can", "do", "does", "for", "from", "had", "has", "have", "how", "in",
  "into", "is", "it", "its", "of", "on", "onto", "or", "that", "the",
  "their", "then", "there", "these", "this", "those", "to", "using", "was",
  "were", "what", "when", "which", "with", "without",
]);

/** Descriptive User-Agent, as arXiv's API terms request. */
const USER_AGENT =
  "Chronicle/1.0 (research discovery; +https://github.com/rishikesh-193/Personalized-news-paper-and-research-digestion)";

/** Raised instead of breaking arXiv's rate policy. */
export class ArxivBusyError extends Error {
  constructor() {
    super("arXiv asks for one request every few seconds — try again shortly.");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let tail: Promise<void> = Promise.resolve();
let lastRequestAt = 0;
let waiting = 0;

/** Serialized slot: one arXiv request at a time, spaced ≥3s apart. */
export async function withArxivSlot<T>(task: () => Promise<T>): Promise<T> {
  if (waiting > MAX_QUEUED) throw new ArxivBusyError();

  waiting += 1;
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });

  try {
    await previous;
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return await task();
  } finally {
    waiting -= 1;
    release();
  }
}

/* --------------------------------------------------------------------------
 * Query construction
 * ------------------------------------------------------------------------ */

/** Escapes a phrase for arXiv's quoted field syntax (backslash, double quote). */
export function escapeArxivPhrase(phrase: string): string {
  return phrase.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function tidy(phrase: string): string {
  return phrase.trim().replace(/\s+/g, " ");
}

/** Exact-phrase query across title and abstract. */
export function buildExactPhraseQuery(query: string): string {
  const escaped = escapeArxivPhrase(tidy(query));
  return `(ti:"${escaped}" OR abs:"${escaped}")`;
}

/** Meaningful, de-duplicated terms — stop words and 1-char tokens dropped. */
export function meaningfulTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const raw of tidy(query).toLowerCase().split(" ")) {
    const term = raw.replace(/[^\p{L}\p{N}_.-]/gu, "");
    if (term.length < 2 || STOP_WORDS.has(term) || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }

  return terms;
}

/**
 * Fallback query: every meaningful term must appear in the title or the
 * abstract. Returns null when no term survives (nothing to widen to).
 */
export function buildAllTermsQuery(query: string): string | null {
  const terms = meaningfulTerms(query);
  if (terms.length === 0) return null;

  const clauses = terms.map((term) => {
    const escaped = escapeArxivPhrase(term);
    return `(ti:"${escaped}" OR abs:"${escaped}")`;
  });

  // A single-term search is itself; several terms are ANDed as one group.
  return clauses.length === 1
    ? clauses[0]
    : `(${clauses.join(" AND ")})`;
}

/** Fully-encoded API URL: operators and quotes are percent-encoded. */
export function arxivSearchUrl(searchQuery: string, maxResults: number): string {
  return (
    `${ENDPOINT}?search_query=${encodeURIComponent(searchQuery)}` +
    `&start=0&max_results=${maxResults}` +
    `&sortBy=relevance&sortOrder=descending`
  );
}

/* --------------------------------------------------------------------------
 * Canonical identifiers
 * ------------------------------------------------------------------------ */

/** `2506.06962v3` → `2506.06962` (also strips a trailing version in a URL). */
export function stripArxivVersion(value: string): string {
  return value.trim().replace(/v\d+(?=[/?#]|$)/, "");
}

function idFromAbsUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0];
  const match = path.match(/arxiv\.org\/abs\/(.+)$/);
  return match ? stripArxivVersion(match[1]) : null;
}

/**
 * Normalizes one arXiv result: the id loses its version suffix (so the same
 * paper is one row however many revisions appear) and the URL becomes the
 * stable, version-free https abstract page.
 */
export function canonicalizeArxivPaper(paper: DiscoveredPaper): DiscoveredPaper {
  const id =
    idFromAbsUrl(paper.url) || stripArxivVersion(paper.externalId);
  return {
    ...paper,
    kind: "paper",
    source: "arxiv",
    externalId: id,
    url: `https://arxiv.org/abs/${id}`,
  };
}

/** De-duplicates by canonical arXiv id, keeping the first (most relevant) hit. */
export function dedupeByArxivId(items: DiscoveredPaper[]): DiscoveredPaper[] {
  const seen = new Set<string>();
  const kept: DiscoveredPaper[] = [];

  for (const item of items) {
    const paper = canonicalizeArxivPaper(item);
    if (!paper.title.trim() || !paper.externalId) continue;
    if (seen.has(paper.externalId)) continue;
    seen.add(paper.externalId);
    kept.push(paper);
  }

  return kept;
}

/** A hit counts as usable when it carries an abstract to summarize. */
export function isUsableArxivResult(paper: DiscoveredPaper): boolean {
  return (
    paper.title.trim().length > 0 && (paper.abstract ?? "").trim().length > 0
  );
}

/* --------------------------------------------------------------------------
 * Search
 * ------------------------------------------------------------------------ */

/** One page of results for one arXiv query string (injectable for tests). */
export type ArxivRequest = (
  searchQuery: string,
  maxResults: number,
) => Promise<DiscoveredPaper[]>;

export interface ArxivSearchOutcome {
  /** Exact-phrase hits first, then weaker all-terms matches. */
  papers: DiscoveredPaper[];
  usedFallback: boolean;
  /** The query strings actually sent, in order. */
  queries: string[];
}

/**
 * Exact phrase first; widen to all-terms only when fewer than
 * `MIN_USABLE_RESULTS` usable hits came back. Combined results are
 * de-duplicated by canonical arXiv id and capped at `maxResults`.
 */
export async function collectArxivResults(
  query: string,
  request: ArxivRequest,
  maxResults: number = MAX_RESULTS,
): Promise<ArxivSearchOutcome> {
  const exactQuery = buildExactPhraseQuery(query);
  const primary = dedupeByArxivId(await request(exactQuery, maxResults));
  const usable = primary.filter(isUsableArxivResult).length;

  const allTermsQuery = buildAllTermsQuery(query);
  // A one-word search widens to the same query, so there is nothing to add.
  const canWiden = allTermsQuery !== null && allTermsQuery !== exactQuery;

  if (usable >= MIN_USABLE_RESULTS || !canWiden) {
    return {
      papers: primary.slice(0, maxResults),
      usedFallback: false,
      queries: [exactQuery],
    };
  }

  const fallback = dedupeByArxivId(
    await request(allTermsQuery as string, maxResults),
  );
  const seen = new Set(primary.map((paper) => paper.externalId));
  const merged = [...primary];
  for (const paper of fallback) {
    if (seen.has(paper.externalId)) continue;
    seen.add(paper.externalId);
    merged.push(paper);
  }

  return {
    papers: merged.slice(0, maxResults),
    usedFallback: true,
    queries: [exactQuery, allTermsQuery as string],
  };
}

/** Fetches one page through the serialized arXiv slot. */
async function requestArxivPage(
  searchQuery: string,
  maxResults: number,
): Promise<DiscoveredPaper[]> {
  const url = arxivSearchUrl(searchQuery, maxResults);
  return withArxivSlot(async () => {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`arXiv HTTP ${response.status}`);
    }
    return parseArxivAtom(await response.text());
  });
}

/** Relevance-ranked papers for a query (at most `maxResults`). */
export async function searchArxiv(
  query: string,
  maxResults = MAX_RESULTS,
): Promise<DiscoveredPaper[]> {
  const { papers } = await collectArxivResults(query, requestArxivPage, maxResults);
  return papers;
}
