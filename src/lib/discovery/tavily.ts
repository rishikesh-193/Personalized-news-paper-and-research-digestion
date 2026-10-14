import { canonicalUrl, type DiscoveredPaper } from "./util";

/**
 * Tavily search API client for web mode. Basic depth, at most 5 results.
 * Only the search snippet is kept — arbitrary result pages are never
 * fetched, so no third-party page content is pulled in.
 */

const ENDPOINT = "https://api.tavily.com/search";
const REQUEST_TIMEOUT_MS = 20_000;

interface TavilyResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  published_date?: unknown;
}

export function isTavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

/** Web results for a query, mapped to the shared discovery shape. */
export async function searchTavily(
  query: string,
  maxResults = 5,
): Promise<DiscoveredPaper[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not configured");

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Tavily HTTP ${response.status}`);
  }

  const data = (await response.json()) as { results?: unknown };
  const results = Array.isArray(data.results)
    ? (data.results as TavilyResult[])
    : [];

  const items: DiscoveredPaper[] = [];
  for (const result of results) {
    const url = typeof result.url === "string" ? result.url.trim() : "";
    const title = typeof result.title === "string" ? result.title.trim() : "";
    const canonical = url ? canonicalUrl(url) : null;
    if (!url || !title || !canonical) continue;

    const snippet =
      typeof result.content === "string" ? result.content.trim() : "";
    const published =
      typeof result.published_date === "string"
        ? result.published_date.slice(0, 10)
        : null;

    items.push({
      kind: "web",
      source: "tavily",
      externalId: canonical,
      url,
      title,
      authors: [],
      abstract: snippet || null,
      publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(published ?? "") ? published : null,
    });
  }

  return items;
}
