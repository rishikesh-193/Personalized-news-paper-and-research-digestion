/** Small shared helpers for the ingestion job. */

/**
 * Strips tracking parameters (utm_*) and fragments; keeps everything else.
 * Returns null for unparseable URLs.
 */
export function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
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
