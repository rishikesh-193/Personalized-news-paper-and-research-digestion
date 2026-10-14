/**
 * Timing curves for the landing page's scroll deck.
 *
 * Kept pure so the sequence can be tested without scrolling a real page — the
 * sequence is what was wrong.
 *
 * Two defects lived in the inline `useTransform` calls this replaces:
 *
 * 1. Panel 0 faded in over `[0, 0.08]`, so at scroll progress 0 it had
 *    `opacity: 0`. The pinned stage therefore opened on an EMPTY frame: the
 *    reader scrolled into a section with nothing in it, which reads as the
 *    reveal running in the wrong direction at the wrong time.
 * 2. Nothing ever faded OUT. Every panel held `opacity: 1` from its entry
 *    onwards while all three stayed stacked at the same position, so the panels
 *    piled on top of each other instead of succeeding one another — the page
 *    became a single card wearing two invisible ones.
 *
 * The curve below gives each panel a window: it is opaque at the start of its
 * own slice, and — except for the first and last — it leaves before the next
 * arrives.
 */

export interface PanelTiming {
  /** Opacity keyframe positions, strictly increasing. */
  stops: number[];
  /** Opacity at each stop, in the same order. */
  values: number[];
  /** Progress at which this panel begins settling into place. */
  from: number;
  /** Progress at which this panel has fully settled. */
  to: number;
}

/** Share of a panel's slice spent fading in (skipped for the first panel). */
const FADE_IN = 0.07;
/** Share of a panel's slice spent fading out (skipped for the last panel). */
const FADE_OUT = 0.1;
/** Smallest gap kept between keyframes so the curve is always well-formed. */
const MIN_STEP = 0.01;

/**
 * Opacity curve for one panel of `total`.
 *
 * Invariants, all covered by tests:
 * - the first panel is opaque at progress 0 (the stage is never empty);
 * - the last panel never fades out (the section never ends blank);
 * - `stops` is strictly increasing, as `useTransform` requires;
 * - a middle panel is fully opaque for a real span, not for an instant.
 */
export function panelTiming(index: number, total: number): PanelTiming {
  const safeTotal = Math.max(1, Math.floor(total));
  const safeIndex = Math.min(Math.max(0, Math.floor(index)), safeTotal - 1);

  const from = safeIndex / safeTotal;
  const to = (safeIndex + 1) / safeTotal;

  // A single panel simply stays put.
  if (safeTotal === 1) {
    return { stops: [0, 1], values: [1, 1], from: 0, to: 1 };
  }

  const isFirst = safeIndex === 0;
  const isLast = safeIndex === safeTotal - 1;

  const stops: number[] = [];
  const values: number[] = [];

  if (!isFirst) {
    stops.push(from);
    values.push(0);
  }

  // The point by which this panel has arrived. Clamped so it always leaves room
  // for the exit keyframes when the slices are narrow.
  const settled = Math.max(
    from + MIN_STEP,
    Math.min(from + FADE_IN, to - FADE_OUT - MIN_STEP),
  );
  stops.push(settled);
  values.push(1);

  if (!isLast) {
    const leaving = Math.max(settled + MIN_STEP, to - FADE_OUT);
    stops.push(leaving);
    values.push(1);
    stops.push(Math.max(leaving + MIN_STEP, to));
    values.push(0);
  }

  return { stops, values, from, to };
}

/** Panels stack back-to-front, so the newest one is drawn on top. */
export function panelZIndex(index: number): number {
  return index;
}
