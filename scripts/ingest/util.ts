/** Small shared helpers for the ingestion job. */

/**
 * Query parameters that identify a campaign, referrer or click, never the
 * article. Two links to the same story must normalize to the same string, or
 * the same article gets ingested and summarized twice.
 */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "_ga",
  "_gl",
  "ref_src",
  "ref_url",
  "cmpid",
  "cmp",
  "at_medium",
  "at_campaign",
  "ito",
  "spm",
  "guccounter",
  "guce_referrer",
  "guce_referrer_sig",
  "__twitter_impression",
  "share_id",
]);

/**
 * Strips tracking/campaign parameters and fragments, drops a decorative
 * trailing slash, and lowercases the host. Everything else (including
 * meaningful query strings such as `?id=7`) is preserved. Returns null for
 * unparseable URLs.
 */
export function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
        url.searchParams.delete(key);
      }
    }
    // `//example.org/story/` and `//example.org/story` are the same page; only
    // collapse the trailing slash when there is no query to preserve.
    if (url.pathname.length > 1 && url.pathname.endsWith("/") && !url.search) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Named entities feeds actually emit. Numeric entities (&#8217;, &#x2019;)
 * are handled generically; anything unknown is left untouched rather than
 * guessed at.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  times: "×",
  deg: "°",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  yen: "¥",
};

/**
 * Decodes HTML entities in feed-provided text. Feeds often wrap titles in
 * entities ("Apple&#8217;s HomeView"), which must not reach the database as
 * literal "&#8217;" text in the UI.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || !input.includes("&")) return input;
  return input.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, body: string) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        const code = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      if (body.startsWith("#")) {
        const code = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    },
  );
}

/** Lowercased, punctuation-free title used for near-duplicate detection. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const USER_AGENT =
  "ChronicleIngest/1.0 (+https://github.com/rishikesh-193/Personalized-news-paper-and-research-digestion)";

/** fetch with a hard timeout; throws on network errors and non-2xx. */
export async function fetchWithTimeout(
  url: string,
  timeoutMs = 15_000,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": USER_AGENT, ...init.headers },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response;
}

/**
 * fetch with a hard timeout plus bounded retries for transient failures
 * (network errors, 429 and 5xx). 4xx other than 429 is a permanent answer and
 * is returned immediately so a dead feed fails fast instead of burning the
 * per-run time budget. Backoff is exponential with jitter-free determinism.
 */
export async function fetchWithRetry(
  url: string,
  { timeoutMs = 15_000, retries = 2, init = {} }: {
    timeoutMs?: number;
    retries?: number;
    init?: RequestInit;
  } = {},
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": USER_AGENT, ...init.headers },
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt < retries) {
          await sleep(Math.min(8_000, 500 * 2 ** attempt));
          lastError = new Error(`HTTP ${response.status} for ${url}`);
          continue;
        }
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(Math.min(8_000, 500 * 2 ** attempt));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `worker` over `items` with at most `limit` in flight. The pool stops
 * pulling new items once `shouldStop` returns true (used to end the run
 * cleanly when rate limits persist).
 */
export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  let next = 0;
  async function lane(): Promise<void> {
    while (next < items.length && !shouldStop()) {
      const index = next++;
      await worker(items[index], index);
    }
  }
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    () => lane(),
  );
  await Promise.all(lanes);
}

export function log(message: string): void {
  console.log(`[ingest] ${message}`);
}

export function logError(message: string): void {
  console.error(`[ingest] ${message}`);
}
