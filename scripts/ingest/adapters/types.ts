/** One interface behind every source adapter (Phase 5: RSS only). */

export interface RawItem {
  /** Canonical-ish URL as provided by the feed (normalized later). */
  url: string;
  title: string;
  /** Publication time if the feed provided one; null drops the item. */
  publishedAt: Date | null;
  /** Feed-provided summary HTML/text — the fallback when page extraction fails. */
  summary: string;
  /** Feed-declared source name; adapter-level default wins if absent. */
  source: string;
  /** Topic label for this item — must be one of the onboarding labels. */
  topic: string;
  /** Subtopics the source declared for itself (see classify.classifySubtopic). */
  feedSubtopics?: string[];
  /**
   * The FEED this item came from (not the article URL). In-memory only — used
   * to attribute per-source "fetched vs accepted" counts in the run report;
   * never written to the database.
   */
  feedUrl?: string;
}

/** What one feed did this run — the raw material for the per-run report. */
export interface SourceFetchReport {
  /** Stable registry id (feeds.sourceId) — disambiguates repeat publishers. */
  id: string;
  source: string;
  topic: string;
  url: string;
  outcome: "ok" | "empty" | "error";
  /** Entries the feed exposed. */
  entries: number;
  /** Entries that carried a usable timestamp (the rest are dropped). */
  dated: number;
  /**
   * Entries that survived freshness + dedupe, i.e. actually usable news from
   * this source, before the per-run budget. Filled in by the pipeline.
   * A source with entries > 0 but accepted === 0 is publishing content this
   * pipeline cannot use — the distinction the coverage audit needs.
   */
  accepted: number;
  /** Milliseconds spent on this feed, including retries. */
  ms: number;
  error: string | null;
}

export interface FetchResult {
  items: RawItem[];
  /** One entry per configured feed, attempted or not. */
  sources: SourceFetchReport[];
}

export interface SourceAdapter {
  readonly name: string;
  /**
   * Returns raw items from all configured sources. Per-source failures are
   * reported in `sources` and skipped rather than failing the whole fetch.
   */
  fetch(): Promise<FetchResult>;
}
