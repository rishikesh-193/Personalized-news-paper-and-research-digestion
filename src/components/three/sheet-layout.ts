/**
 * Geometry for the hero's sheet stack.
 *
 * Kept pure and free of `three` so the depth ordering can be tested without a
 * WebGL context — because the ordering is exactly what went wrong.
 *
 * The original stack gave every sheet its own yaw (`-0.05, +0.06, -0.02,
 * +0.09`) while separating neighbouring sheets by only 0.055 in depth. A sheet
 * is SHEET_WIDTH wide, so a relative yaw of ~0.11 rad swings a sheet's far edge
 * `SHEET_WIDTH * sin(0.11)` ≈ 0.32 units through the scene — roughly six times
 * the gap it was supposed to stay behind.
 *
 * The consequence was visible, not theoretical: the untinted second sheet
 * crossed in front of the textured front page, hiding its left ~35% and slicing
 * the masthead mid-word ("The Chronicle." rendered as "onicle."). The page
 * looked clipped even though the drawn texture was perfectly fine.
 *
 * The fix is a rule this module can state and test: a sheet may vary in ROLL
 * only. A roll rotates the sheet in the screen plane, so it cannot change how
 * far a sheet reaches into the scene, and the depth order is then exactly the
 * order of `z`. Any yaw is applied to the whole group by the scene's frame
 * loop, which rotates the stack rigidly and therefore cannot reorder it.
 */

export interface SheetPlacement {
  index: number;
  /** World x of the sheet centre. */
  x: number;
  /** World z of the sheet centre. Strictly descending: index 0 is front-most. */
  z: number;
  /** Vertical offset within the stack. */
  y: number;
  /** Roll about Z. Depth-neutral by construction. */
  rotZ: number;
  /**
   * Yaw about Y. Must stay 0 for every sheet. Exposed only so a regression is
   * visible to `frontSheetCoveredFraction` (and to the test that guards it).
   */
  rotY: number;
}

export const SHEET_WIDTH = 2.95;
export const SHEET_HEIGHT = 3.9;

/** Centre-to-centre depth gap between neighbouring sheets. */
export const SHEET_Z_GAP = 0.075;

/** Horizontal step between neighbouring sheets. */
export const SHEET_X_STEP = 0.1;

const BASE_THICKNESS = 0.014;
const THICKNESS_STEP = 0.002;

/** Box depth for a sheet; slightly thicker further back for a stacked look. */
export function sheetThickness(index: number): number {
  return BASE_THICKNESS + index * THICKNESS_STEP;
}

const SHEET_Y = [0.06, -0.06, -0.18, -0.3];
const SHEET_ROLLS = [0.015, -0.02, 0.03, -0.035];
const SHEET_TINTS = ["#ffffff", "#F1E9DE", "#EADFD2", "#E4D8C9"];

/** Tint for a sheet; index 0 is the textured front page, drawn white. */
export function sheetTint(index: number): string {
  return SHEET_TINTS[index] ?? "#E4D8C9";
}

/** Whether a sheet carries the drawn front page. Only the front sheet does. */
export function sheetIsTextured(index: number): boolean {
  return index === 0;
}

/**
 * The hero stack. `count` is 4 normally and 3 on narrow, low-power viewports
 * (the deepest sheet is dropped, which keeps the whole stack smaller).
 */
export function heroSheets(count: number): SheetPlacement[] {
  const safeCount = Math.max(1, Math.min(count, SHEET_Y.length));
  return Array.from({ length: safeCount }, (_, index) => ({
    index,
    y: SHEET_Y[index],
    x: (index - (safeCount - 1) / 2) * SHEET_X_STEP,
    // Strictly descending so index 0 is unambiguously front-most.
    z: -index * SHEET_Z_GAP,
    // Never a per-sheet yaw — see the module comment.
    rotY: 0,
    rotZ: SHEET_ROLLS[index] ?? 0,
  }));
}

/**
 * Depth of a sheet's front surface at world x.
 *
 * A sheet yawed by `rotY` about its own centre is a plane, so its depth varies
 * linearly across its width: `z - (x - centreX) * tan(rotY)`.
 */
export function sheetFrontSurfaceZ(sheet: SheetPlacement, x: number): number {
  const tilt = Math.tan(sheet.rotY) * (x - sheet.x);
  return sheet.z - tilt + sheetThickness(sheet.index) / 2;
}

/**
 * Camera framing.
 *
 * These are exported (and consumed by the scene) rather than written inline in
 * `newspaper-scene.tsx` so the "the stack must stay inside the canvas" rule can
 * be asserted against the real numbers instead of a copy that can drift.
 *
 * At 9.6 the stack filled ~81% of the canvas height, and the old frame loop
 * pushed it DOWN by 0.5 at full scroll, which put its bottom edge below the
 * frustum — the array was hard-clipped against the canvas edge. 10.6 leaves
 * ~13% headroom above and below at the tightest aspect ratio the hero column
 * takes.
 */
export const SCENE_CAMERA_DISTANCE = 10.6;
export const SCENE_FOV_DEGREES = 28;
/** Fan spread between neighbouring sheets at rest. */
export const SHEET_SPREAD = 0.11;
export const SHEET_LOW_POWER_SPREAD = 0.07;
/** How far the whole stack lifts by full scroll. Upward, so it cannot clip. */
export const SHEET_SCROLL_LIFT = 0.18;
/** How far the whole stack rolls by full scroll (radians). */
export const SHEET_SCROLL_ROLL = -0.04;

/** Half-height of the visible frustum at a camera distance, in world units. */
export function visibleHalfHeight(distance: number, fovDegrees: number): number {
  return distance * Math.tan((fovDegrees * Math.PI) / 360);
}

/** Half-width of the visible frustum, given the canvas aspect ratio (w / h). */
export function visibleHalfWidth(
  distance: number,
  fovDegrees: number,
  aspect: number,
): number {
  return visibleHalfHeight(distance, fovDegrees) * aspect;
}

export interface StackBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * World-space bounds of the whole stack at a scroll position.
 *
 * Mirrors the scene's frame loop exactly: the fan, the lift and the roll are
 * all reproduced here, and each sheet contributes its rolled box extent.
 */
export function stackBounds(
  count: number,
  scrollProgress: number,
  spread: number = SHEET_SPREAD,
): StackBounds {
  const sheets = heroSheets(count);
  const centre = (sheets.length - 1) / 2;
  const groupRoll = scrollProgress * SHEET_SCROLL_ROLL;
  const groupSin = Math.sin(groupRoll);
  const groupCos = Math.cos(groupRoll);

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  sheets.forEach((sheet, index) => {
    const x = (index - centre) * spread * 0.9 * (1 + scrollProgress * 1.6);
    const y = sheet.y + scrollProgress * SHEET_SCROLL_LIFT;

    const halfW = SHEET_WIDTH / 2;
    const halfH = SHEET_HEIGHT / 2;
    const cos = Math.cos(sheet.rotZ);
    const sin = Math.sin(sheet.rotZ);
    // Axis-aligned extent of this sheet's rolled box, before the group roll.
    const ownX = Math.abs(halfW * cos) + Math.abs(halfH * sin);
    const ownY = Math.abs(halfW * sin) + Math.abs(halfH * cos);
    // Then the group roll rotates that extent.
    const extX = Math.abs(ownX * groupCos) + Math.abs(ownY * groupSin);
    const extY = Math.abs(ownX * groupSin) + Math.abs(ownY * groupCos);

    minX = Math.min(minX, x - extX);
    maxX = Math.max(maxX, x + extX);
    minY = Math.min(minY, y - extY);
    maxY = Math.max(maxY, y + extY);
  });

  return { minX, maxX, minY, maxY };
}

/**
 * Fraction of the front sheet's width stolen by any sheet sitting in FRONT of
 * it (i.e. reaching a greater z at that x).
 *
 * Zero means the front page is fully visible. The bug this guards against
 * measured ~0.35, which is why the masthead lost its first characters.
 */
export function frontSheetCoveredFraction(
  placements: SheetPlacement[],
  samples = 400,
): number {
  const front = placements[0];
  if (!front || placements.length < 2) return 0;

  const left = front.x - SHEET_WIDTH / 2;
  let covered = 0;
  for (let step = 0; step < samples; step += 1) {
    const x = left + (SHEET_WIDTH * (step + 0.5)) / samples;
    const frontZ = sheetFrontSurfaceZ(front, x);
    for (let i = 1; i < placements.length; i += 1) {
      const other = placements[i];
      const otherLeft = other.x - SHEET_WIDTH / 2;
      const otherRight = other.x + SHEET_WIDTH / 2;
      // Only a sheet that actually spans this x can cover it.
      if (x < otherLeft || x > otherRight) continue;
      if (sheetFrontSurfaceZ(other, x) > frontZ) {
        covered += 1;
        break;
      }
    }
  }
  return covered / samples;
}
