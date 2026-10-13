import Parser from "rss-parser";
import type { FeedConfig } from "../feeds";
import type { RawItem, SourceAdapter } from "./types";
import { USER_AGENT, logError } from "../util";

/** RSS/Atom adapter — the only adapter in Phase 5; a news-API adapter can be
 * added later as one new file implementing SourceAdapter. */
export class RssAdapter implements SourceAdapter {
  readonly name = "rss";

  constructor(private readonly feeds: FeedConfig[]) {}

  async fetch(): Promise<RawItem[]> {
    const parser = new Parser({
      timeout: 15_000,
      headers: { "User-Agent": USER_AGENT },
    });

    const results = await Promise.all(
      this.feeds.map(async (feed): Promise<RawItem[]> => {
        try {
          const parsed = await parser.parseURL(feed.url);
          return (parsed.items ?? [])
            .map((item): RawItem => ({
              url: item.link ?? "",
              title: (item.title ?? "").trim(),
              publishedAt: item.isoDate ? new Date(item.isoDate) : null,
              summary: item.contentSnippet ?? item.content ?? item.summary ?? "",
              source: feed.source,
              topic: feed.topic,
            }))
            .filter((item) => item.url && item.title);
        } catch (error) {
          logError(
            `feed failed: ${feed.source} (${feed.url}) — ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return [];
        }
      }),
    );

    return results.flat();
  }
}
