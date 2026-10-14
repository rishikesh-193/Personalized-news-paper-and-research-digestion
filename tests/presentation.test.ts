import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCENE_CAMERA_DISTANCE,
  SCENE_FOV_DEGREES,
  SHEET_HEIGHT,
  SHEET_LOW_POWER_SPREAD,
  SHEET_SPREAD,
  frontSheetCoveredFraction,
  heroSheets,
  stackBounds,
  visibleHalfHeight,
  visibleHalfWidth,
  type SheetPlacement,
} from "../src/components/three/sheet-layout";
import {
  REVEAL_VIEWPORT,
  thresholdIsSatisfiable,
} from "../src/components/motion/reveal-viewport";
import { panelTiming } from "../src/components/landing/deck-timing";
import { interleaveByTopic, rankArticles } from "../src/lib/ranking";

// ---------------------------------------------------------------------------
// Hero sheet stack: the front page must never be covered by a sheet behind it.
//
// This is the bug that made the landing hero look clipped. Each sheet had its
// own yaw while neighbours were separated by only 0.055 in depth, so a sheet's
// far edge swung ~0.32 through the scene and crossed in front of the textured
// front page, hiding its left third and cutting the masthead mid-word.
// ---------------------------------------------------------------------------

test("no sheet covers the front page in the produced layout", () => {
  for (const count of [3, 4]) {
    const covered = frontSheetCoveredFraction(heroSheets(count));
    assert.equal(
      covered,
      0,
      `heroSheets(${count}) leaves ${(covered * 100).toFixed(1)}% of the front page covered`,
    );
  }
});

test("the old per-sheet yaw layout really did cover the front page", () => {
  // The exact placements shipped before the fix: distinct rotY per sheet while
  // the depth gap stayed 0.055.
  const legacy: SheetPlacement[] = [
    { index: 0, x: -0.15, z: 0.0825, y: 0.06, rotY: -0.05, rotZ: 0.015 },
    { index: 1, x: -0.05, z: 0.0275, y: -0.06, rotY: 0.06, rotZ: -0.02 },
    { index: 2, x: 0.05, z: -0.0275, y: -0.18, rotY: -0.02, rotZ: 0.03 },
    { index: 3, x: 0.15, z: -0.0825, y: -0.3, rotY: 0.09, rotZ: -0.035 },
  ];
  const covered = frontSheetCoveredFraction(legacy);
  // Observed on the rendered page at roughly this fraction, which is why the
  // masthead lost its leading characters.
  assert.ok(
    covered > 0.25,
    `expected the legacy layout to hide a large part of the page, got ${covered}`,
  );
});

test("sheets stay strictly ordered in depth, front-most first", () => {
  const sheets = heroSheets(4);
  for (let i = 1; i < sheets.length; i += 1) {
    assert.ok(
      sheets[i].z < sheets[i - 1].z,
      `sheet ${i} must sit behind sheet ${i - 1}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Hero framing: the stack must stay inside the canvas at every scroll position.
// The old frame loop pushed it down by half a unit, carrying its bottom edge out
// of the frustum, where it was hard-clipped by the canvas edge.
// ---------------------------------------------------------------------------

/** The tightest canvas the hero column takes: lg at 505x560. */
const TIGHTEST_ASPECT = 505 / 560;
const SCROLL_STEPS = [0, 0.25, 0.5, 0.75, 1];

test("the sheet stack stays inside the camera frame at every scroll position", () => {
  const halfHeight = visibleHalfHeight(SCENE_CAMERA_DISTANCE, SCENE_FOV_DEGREES);
  const halfWidth = visibleHalfWidth(
    SCENE_CAMERA_DISTANCE,
    SCENE_FOV_DEGREES,
    TIGHTEST_ASPECT,
  );

  for (const count of [3, 4]) {
    const spread = count === 3 ? SHEET_LOW_POWER_SPREAD : SHEET_SPREAD;
    for (const progress of SCROLL_STEPS) {
      const bounds = stackBounds(count, progress, spread);
      assert.ok(
        bounds.maxY < halfHeight,
        `${count} sheets at scroll ${progress}: top ${bounds.maxY.toFixed(2)} exceeds ${halfHeight.toFixed(2)}`,
      );
      assert.ok(
        bounds.minY > -halfHeight,
        `${count} sheets at scroll ${progress}: bottom ${bounds.minY.toFixed(2)} is below ${(-halfHeight).toFixed(2)}`,
      );
      assert.ok(
        bounds.maxX < halfWidth && bounds.minX > -halfWidth,
        `${count} sheets at scroll ${progress}: width ${bounds.minX.toFixed(2)}..${bounds.maxX.toFixed(2)} exceeds +-${halfWidth.toFixed(2)}`,
      );
    }
  }
});

test("the old framing really did clip the stack", () => {
  // The previous frame loop: group.position.y = -progress * 0.5, at distance 9.6.
  const halfHeight = visibleHalfHeight(9.6, 28);
  const lowestSheetY = -0.3;
  const legacyBottom = lowestSheetY - SHEET_HEIGHT / 2 - 0.5;
  assert.ok(
    legacyBottom < -halfHeight,
    `expected the old framing to clip: bottom ${legacyBottom} vs ${-halfHeight}`,
  );
});

test("per-sheet yaw stays disabled, since it is what broke depth ordering", () => {
  for (const sheet of heroSheets(4)) {
    assert.equal(
      sheet.rotY,
      0,
      "a non-zero per-sheet yaw can swing a sheet through the front page",
    );
  }
});

// ---------------------------------------------------------------------------
// Reveal for tall wrappers.
//
// Today's 42 non-lead stories sit inside one block many viewports tall. A fixed
// fraction threshold can never be satisfied by such an element, so the reveal
// never fired and every one of those cards stayed at opacity 0 — the page
// looked like it held a single story.
// ---------------------------------------------------------------------------

test("the shared reveal threshold is satisfiable for a block taller than the viewport", () => {
  // Roughly the height of the real Today grid, against a 900px viewport.
  const tallBlock = 21_000;
  assert.ok(
    thresholdIsSatisfiable(REVEAL_VIEWPORT.amount, tallBlock, 900),
    "the reveal must be able to fire for content taller than the viewport",
  );
});

test("a fixed 0.2 threshold could never fire for that same block", () => {
  // Demonstrates the original defect, so a regression back to a fixed fraction
  // fails loudly rather than silently hiding the feed again.
  assert.equal(thresholdIsSatisfiable(0.2, 21_000, 900), false);
  // ...and confirming the check is not simply always false.
  assert.equal(thresholdIsSatisfiable(0.2, 400, 900), true);
});

// ---------------------------------------------------------------------------
// Landing deck timing.
// ---------------------------------------------------------------------------

/** Mirrors motion's `useTransform` clamping so the curve is actually evaluated. */
function opacityAt(timing: { stops: number[]; values: number[] }, p: number) {
  const { stops, values } = timing;
  if (p <= stops[0]) return values[0];
  if (p >= stops[stops.length - 1]) return values[values.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (p >= stops[i] && p <= stops[i + 1]) {
      const span = stops[i + 1] - stops[i];
      const t = span === 0 ? 0 : (p - stops[i]) / span;
      return values[i] + (values[i + 1] - values[i]) * t;
    }
  }
  return values[values.length - 1];
}

test("the first deck panel is visible at scroll progress zero", () => {
  const first = panelTiming(0, 3);
  assert.equal(
    opacityAt(first, 0),
    1,
    "the pinned stage must not open on an empty frame",
  );
});

test("the last deck panel never fades out", () => {
  const last = panelTiming(2, 3);
  assert.equal(opacityAt(last, 1), 1);
});

test("deck panels succeed one another instead of piling up", () => {
  const total = 3;
  for (let index = 0; index < total - 1; index += 1) {
    const outgoing = panelTiming(index, total);
    // By the time the next panel has arrived, the previous one must be gone.
    const nextArrives = panelTiming(index + 1, total).stops[0];
    assert.ok(
      opacityAt(outgoing, nextArrives) < 0.05,
      `panel ${index} is still visible when panel ${index + 1} arrives`,
    );
  }
});

test("deck opacity keyframes are strictly increasing and opaque mid-slice", () => {
  const total = 3;
  for (let index = 0; index < total; index += 1) {
    const timing = panelTiming(index, total);
    assert.equal(timing.stops.length, timing.values.length);
    for (let i = 1; i < timing.stops.length; i += 1) {
      assert.ok(
        timing.stops[i] > timing.stops[i - 1],
        `panel ${index} stops must strictly increase: ${timing.stops.join(", ")}`,
      );
    }
    // Somewhere in its own slice the panel is fully opaque.
    const midpoint = (timing.from + timing.to) / 2;
    assert.ok(
      opacityAt(timing, midpoint) > 0.9,
      `panel ${index} is not fully visible at the middle of its slice`,
    );
  }
});

test("a single-panel deck just stays visible", () => {
  const timing = panelTiming(0, 1);
  assert.equal(opacityAt(timing, 0), 1);
  assert.equal(opacityAt(timing, 1), 1);
});

// ---------------------------------------------------------------------------
// Topic diversity: one category must not monopolise the feed.
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-10-14T12:00:00Z");

function articleIn(topic: string, index: number) {
  return {
    id: `${topic}-${index}`,
    topic,
    publishedAt: new Date(NOW - index * 60_000).toISOString(),
  };
}

test("interleaving stops one topic from filling the top of the edition", () => {
  // Technology dominates the database, exactly as production does (17 of 66).
  const articles = [
    ...Array.from({ length: 12 }, (_, i) => articleIn("Technology", i)),
    articleIn("Gaming", 0),
    articleIn("Books", 0),
  ];
  const ranked = rankArticles(articles, {
    interests: ["Technology", "Gaming", "Books"],
    likedTopics: {},
    negativeTopics: {},
  }, NOW);

  const planned = interleaveByTopic(ranked);
  const firstThree = planned.slice(0, 3).map((entry) => entry.article.topic);
  assert.equal(
    new Set(firstThree).size,
    3,
    `top of the feed should span every topic, got ${firstThree.join(", ")}`,
  );
  assert.equal(planned.length, ranked.length, "no story may be lost");
});

test("interleaving keeps the strongest story as the lead", () => {
  const articles = [
    ...Array.from({ length: 8 }, (_, i) => articleIn("Technology", i)),
    articleIn("Books", 0),
  ];
  const ranked = rankArticles(articles, {
    interests: ["Technology", "Books"],
    likedTopics: {},
    negativeTopics: {},
  }, NOW);
  assert.equal(interleaveByTopic(ranked)[0].article.id, ranked[0].article.id);
});

test("interleaving is stable and total", () => {
  const articles = [
    articleIn("AI", 0),
    articleIn("AI", 1),
    articleIn("Space", 0),
    articleIn("AI", 2),
  ];
  const ranked = rankArticles(articles, {
    interests: ["AI", "Space"],
    likedTopics: {},
    negativeTopics: {},
  }, NOW);
  const once = interleaveByTopic(ranked);
  const twice = interleaveByTopic(ranked);
  assert.deepEqual(
    once.map((entry) => entry.article.id),
    twice.map((entry) => entry.article.id),
    "interleaving must be deterministic",
  );
  assert.equal(once.length, articles.length);
  assert.equal(new Set(once.map((entry) => entry.article.id)).size, articles.length);
});

test("interleaving handles an empty feed", () => {
  assert.deepEqual(interleaveByTopic([]), []);
});
