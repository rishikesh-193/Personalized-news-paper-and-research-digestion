/**
 * Fair per-run allocation of the article budget.
 *
 * The old cap took a round-robin over (topic, source) groups, which gave every
 * FEED an equal share. That is not the same as giving every CATEGORY an equal
 * share: Gadgets has 7 feeds and Physics has 5, and one prolific publisher
 * inside a category could still fill that category's whole slice. Worse, the
 * stored topic used to come from the model, so balancing by feed topic did not
 * balance stored categories at all — the audit found Technology holding 17 of
 * 38 stored articles.
 *
 * This module balances at two levels, deterministically:
 *
 *   1. across CATEGORIES — one pick per category per round, so every category
 *      with a fresh item gets a slot before any category gets a second;
 *   2. within a CATEGORY — a round-robin across that category's SOURCES, so a
 *      single prolific feed cannot fill its category's slice on its own.
 *
 * Freshest-first ordering is preserved inside each source queue, so
 * time-sensitive stories still move to the front of their own category.
 */
import type { RawItem } from "./adapters/types";

export interface AllocationOptions {
  /** Maximum number of items to select across all categories. */
  cap: number;
  /**
   * Optional ceiling per category. Undefined means unlimited, in which case a
   * category only stops contributing when its candidates run out.
   */
  perCategoryCap?: number;
}

export interface AllocationResult {
  picked: RawItem[];
  /** Candidates that were fresh and unique but did not fit the budget. */
  overBudget: number;
  /** Category → number of items selected, for the run report. */
  perCategory: Record<string, number>;
}

function byFreshestFirst(a: RawItem, b: RawItem): number {
  const left = a.publishedAt?.getTime() ?? 0;
  const right = b.publishedAt?.getTime() ?? 0;
  return right - left;
}

/**
 * Interleaves one category's candidates across its sources: sources are
 * ordered by their freshest item so the category still leads with its newest
 * story, then items are taken round-robin one source at a time.
 */
export function orderWithinCategory(candidates: RawItem[]): RawItem[] {
  const bySource = new Map<string, RawItem[]>();
  for (const item of candidates) {
    const queue = bySource.get(item.source);
    if (queue) queue.push(item);
    else bySource.set(item.source, [item]);
  }

  const queues = [...bySource.entries()]
    .map(([source, items]) => ({ source, items: items.sort(byFreshestFirst) }))
    .sort((a, b) => {
      const diff = byFreshestFirst(a.items[0], b.items[0]);
      // Stable tie-break so the run is reproducible.
      return diff !== 0 ? diff : a.source.localeCompare(b.source);
    });

  const ordered: RawItem[] = [];
  for (let index = 0; ordered.length < candidates.length; index++) {
    let advanced = false;
    for (const queue of queues) {
      const item = queue.items[index];
      if (item) {
        ordered.push(item);
        advanced = true;
      }
    }
    if (!advanced) break;
  }
  return ordered;
}

/**
 * Selects up to `cap` candidates, rotating across categories. Category order
 * is deterministic (alphabetical) so the same inputs always produce the same
 * selection — which is what makes this testable.
 */
export function allocateFairly(
  candidates: RawItem[],
  options: AllocationOptions,
): AllocationResult {
  const { cap, perCategoryCap } = options;
  const perCategory: Record<string, number> = {};
  const picked: RawItem[] = [];

  if (cap <= 0 || candidates.length === 0) {
    return { picked, overBudget: candidates.length, perCategory };
  }

  const byCategory = new Map<string, RawItem[]>();
  for (const item of candidates) {
    const group = byCategory.get(item.topic);
    if (group) group.push(item);
    else byCategory.set(item.topic, [item]);
  }

  const queues = [...byCategory.entries()]
    .map(([topic, items]) => ({ topic, items: orderWithinCategory(items) }))
    .sort((a, b) => a.topic.localeCompare(b.topic));

  for (let round = 0; picked.length < cap; round++) {
    let advanced = false;
    for (const queue of queues) {
      if (picked.length >= cap) break;
      const used = perCategory[queue.topic] ?? 0;
      if (perCategoryCap !== undefined && used >= perCategoryCap) continue;
      const item = queue.items[round];
      if (!item) continue;
      picked.push(item);
      perCategory[queue.topic] = used + 1;
      advanced = true;
    }
    if (!advanced) break;
  }

  return {
    picked,
    overBudget: candidates.length - picked.length,
    perCategory,
  };
}
