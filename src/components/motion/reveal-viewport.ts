/**
 * The in-view trigger shared by every `Reveal`, kept pure so the invariant that
 * matters can be tested directly.
 *
 * `amount` is a fraction of the TARGET ELEMENT's own area, never of the
 * viewport. A fixed fraction is therefore unsatisfiable for any element taller
 * than `viewportHeight / amount`: the IntersectionObserver can never report
 * that ratio, the reveal never fires, and the content stays at `opacity: 0`
 * forever.
 *
 * That is precisely what happened on Today. The 42 non-lead stories were
 * wrapped in a single block many viewports tall, so a 0.2 threshold could never
 * be met — every one of those cards stayed invisible while the short, separate
 * `Reveal` around the lead story fired normally. The page looked as though the
 * edition held a single story, even though all 43 were in the DOM.
 *
 * `"some"` fires as soon as any part of the element is on screen, which is
 * achievable at any height, so no block can be left permanently hidden.
 */

export type ViewportAmount = "some" | "all" | number;

export interface RevealViewport {
  once: boolean;
  amount: ViewportAmount;
}

export const REVEAL_VIEWPORT: RevealViewport = { once: true, amount: "some" };

/**
 * Whether an element of `elementHeight` could ever reach `amount` inside a
 * viewport of `viewportHeight`.
 *
 * This is the check the original code needed and did not have: a threshold is
 * only usable if some scroll position can satisfy it.
 */
export function thresholdIsSatisfiable(
  amount: ViewportAmount,
  elementHeight: number,
  viewportHeight: number,
): boolean {
  if (amount === "some") return true;
  // "all" is satisfiable only while the element fits inside the viewport.
  if (amount === "all") return elementHeight <= viewportHeight;
  if (!(amount > 0)) return true;
  if (elementHeight <= 0) return true;
  if (viewportHeight <= 0) return false;
  // The largest ratio observable is whatever fits: viewport height over element
  // height, capped at 1.
  const best = Math.min(1, viewportHeight / elementHeight);
  return best >= amount;
}
