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
}

export interface SourceAdapter {
  readonly name: string;
  /** Returns raw items from all configured sources; per-source failures are
   * logged and skipped rather than failing the whole fetch. */
  fetch(): Promise<RawItem[]>;
}
