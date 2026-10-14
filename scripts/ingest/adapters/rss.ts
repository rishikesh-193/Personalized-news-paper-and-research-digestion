import Parser from "rss-parser";
import type { FeedConfig } from "../feeds";
import type {
  FetchResult,
  RawItem,
  SourceAdapter,
  SourceFetchReport,
} from "./types";
import { sourceId } from "../feeds";
import { USER_AGENT, decodeHtmlEntities, fetchWithRetry, runPool } from "../util";

/**
 * How many feeds may be in flight at once. Unbounded Promise.all over ~200
 * feeds is both rude to publishers and a good way to collect 429s; this keeps
 * the job inside its time budget without stampeding anyone.
 */
const FEED_CONCURRENCY = 12;
const FEED_TIMEOUT_MS = 15_000;
const FEED_RETRIES = 2;

/** RSS/Atom adapter — the only adapter in Phase 5; a news-API adapter can be
 * added later as one new file implementing SourceAdapter. */
export class RssAdapter implements SourceAdapter {
  readonly name = "rss";

  constructor(private readonly feeds: FeedConfig[]) {}

  async fetch(): Promise<FetchResult> {
    const parser = new Parser({
      timeout: FEED_TIMEOUT_MS,
      headers: { "User-Agent": USER_AGENT },
    });

    const items: RawItem[] = [];
    const sources: SourceFetchReport[] = [];

    await runPool(this.feeds, FEED_CONCURRENCY, async (feed) => {
      const started = Date.now();
      const report: SourceFetchReport = {
        id: sourceId(feed),
        source: feed.source,
        topic: feed.topic,
        url: feed.url,
        outcome: "error",
        entries: 0,
        dated: 0,
        accepted: 0,
        ms: 0,
        error: null,
      };

      try {
        // fetchWithRetry handles transient 429/5xx and network errors; the
        // parsed body is handed to rss-parser so redirects are already
        // resolved and we control the timeout ourselves.
        const response = await fetchWithRetry(feed.url, {
          timeoutMs: FEED_TIMEOUT_MS,
          retries: FEED_RETRIES,
          init: {
            redirect: "follow",
            headers: {
              Accept:
                "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
            },
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const parsed = await parser.parseString(await response.text());
        const raw = parsed.items ?? [];
        report.entries = raw.length;

        const mapped = raw
          .map((item): RawItem => {
            const published = dateFrom(item);
            return {
              url: item.link ?? "",
              // Feeds hand back HTML entities ("Apple&#8217;s") — store the
              // decoded characters so titles read correctly everywhere.
              title: decodeHtmlEntities((item.title ?? "").trim()),
              publishedAt: published,
              summary: decodeHtmlEntities(
                item.contentSnippet ?? item.content ?? item.summary ?? "",
              ),
              source: feed.source,
              topic: feed.topic,
              feedSubtopics: feed.subtopics,
              feedUrl: feed.url,
            };
          })
          .filter((item) => item.url && item.title);

        report.dated = mapped.filter((item) => item.publishedAt !== null).length;
        report.outcome = mapped.length > 0 ? "ok" : "empty";
        items.push(...mapped);
      } catch (error) {
        report.error = error instanceof Error ? error.message : String(error);
      } finally {
        report.ms = Date.now() - started;
        sources.push(report);
      }
    });

    return { items, sources };
  }
}

/**
 * Publication date for one parsed entry. Feeds are inconsistent, so this
 * checks the fields rss-parser exposes in order of reliability. Returns null
 * when nothing parses — the caller drops the item rather than guessing "now",
 * which would let an ancient article look fresh.
 */
function dateFrom(item: Record<string, unknown>): Date | null {
  const candidates = [
    item.isoDate,
    item.pubDate,
    item.published,
    item.updated,
    item.date,
    (item as { "dc:date"?: unknown })["dc:date"],
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const time = Date.parse(candidate);
    if (Number.isFinite(time)) return new Date(time);
  }
  return null;
}
