/**
 * Pure helpers for Research Discovery (part A). No network, no DB — so they
 * can be unit-tested directly.
 */
import { decodeHtmlEntities, normalizeUrl } from "../../../scripts/ingest/util";

/** One discovered item, before it is stored. */
export interface DiscoveredPaper {
  kind: "paper" | "web";
  source: string;
  /** arXiv id for papers, canonical URL for web results. */
  externalId: string;
  url: string;
  title: string;
  authors: string[];
  abstract: string | null;
  /** YYYY-MM-DD, when the provider gave one. */
  publishedAt: string | null;
}

/** Collapses whitespace and lowercases — the cache key for a search. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Canonical URL for dedupe: lowercased host, no fragment, no utm_*. */
export function canonicalUrl(raw: string): string | null {
  const normalized = normalizeUrl(raw);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return null;
  }
}

/** `http://arxiv.org/abs/2405.12345v2` → `2405.12345` (version dropped). */
export function arxivIdFromAbsUrl(raw: string): string | null {
  const match = raw.match(/\/abs\/([A-Za-z0-9._-]+?)(?:v\d+)?$/);
  return match ? match[1] : null;
}

/** Collapses markup whitespace and decodes the HTML entities feeds emit. */
function cleanText(raw: string): string {
  return decodeHtmlEntities(
    raw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** First capture of `<tag>…</tag>` inside an entry block, cleaned. */
function tagText(block: string, tag: string): string | null {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`),
  );
  return match ? cleanText(match[1]) : null;
}

/**
 * Parses the arXiv Atom response into items. arXiv's `<entry>` shape is
 * stable (id, published, title, summary, author/name, link rel="alternate"),
 * so a focused parser avoids pulling a full XML dependency into the app.
 * Entries missing an id or title are dropped.
 */
export function parseArxivAtom(xml: string): DiscoveredPaper[] {
  const results: DiscoveredPaper[] = [];

  for (const match of xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)) {
    const block = match[1];
    const rawId = tagText(block, "id");
    const title = tagText(block, "title");
    if (!rawId || !title) continue;

    const externalId = arxivIdFromAbsUrl(rawId) ?? rawId;
    const url = `https://arxiv.org/abs/${externalId}`;
    const authors = [
      ...block.matchAll(/<author(?:\s[^>]*)?>[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>/g),
    ]
      .map((author) => cleanText(author[1]))
      .filter(Boolean);

    const linkMatch =
      block.match(/<link\b[^>]*rel="alternate"[^>]*\bhref="([^"]+)"/) ??
      block.match(/<link\b[^>]*href="([^"]+)"[^>]*rel="alternate"/);

    const published = tagText(block, "published");
    const publishedDate = published ? published.slice(0, 10) : null;

    results.push({
      kind: "paper",
      source: "arxiv",
      externalId,
      url: linkMatch ? linkMatch[1] : url,
      title,
      authors,
      abstract: tagText(block, "summary") ?? null,
      publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(publishedDate ?? "")
        ? publishedDate
        : null,
    });
  }

  return results;
}

/**
 * Drops items with no title or URL and de-duplicates by arXiv id (papers)
 * or canonical URL (web), keeping the first occurrence.
 */
export function dedupePapers(items: DiscoveredPaper[]): DiscoveredPaper[] {
  const seen = new Set<string>();
  const kept: DiscoveredPaper[] = [];

  for (const item of items) {
    const title = item.title.trim();
    const url = item.url.trim();
    if (!title || !url) continue;

    const canonical = canonicalUrl(url);
    if (!canonical) continue;

    const key =
      item.kind === "paper" ? `paper:${item.externalId}` : `web:${canonical}`;
    if (seen.has(key)) continue;
    seen.add(key);

    kept.push({
      ...item,
      title,
      url,
      // Papers keep their arXiv id (the DB unique key); web results are
      // keyed by their canonical URL.
      externalId: item.kind === "paper" ? item.externalId : canonical,
    });
  }

  return kept;
}

/** How a result's text was obtained — drives the UI honesty label. */
export function basisFor(kind: "paper" | "web"): "abstract" | "snippet" {
  return kind === "paper" ? "abstract" : "snippet";
}
