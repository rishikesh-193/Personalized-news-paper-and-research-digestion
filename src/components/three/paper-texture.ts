import * as THREE from "three";
import { createRandom } from "./prng";

/**
 * Locally drawn newspaper texture.
 *
 * Nothing is fetched: the sheet is painted on a 2D canvas and uploaded as a
 * texture. The printed headline is Chronicle's own public copy and the body is
 * deliberately abstract column rules — never invented article text that could
 * be mistaken for real ingested content.
 */

const PAPER = "#F7F3EC";
const INK = "#17161A";
const RULE = "#B9B2A6";
const BRAND = "#B33A1E";

function roundedRule(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

/** Paints the front page of the newspaper and returns a ready texture. */
export function createFrontPageTexture(): THREE.CanvasTexture {
  const width = 512;
  const height = 680;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = PAPER;
    context.fillRect(0, 0, width, height);

    // Faint paper grain so the sheet reads as stock, not a flat fill. Seeded
    // so the page is identical on every render.
    const random = createRandom(20261014);
    context.globalAlpha = 0.05;
    for (let index = 0; index < 260; index += 1) {
      const x = random() * width;
      const y = random() * height;
      context.fillStyle = index % 3 === 0 ? BRAND : INK;
      context.fillRect(x, y, 1.4, 1.4);
    }
    context.globalAlpha = 1;

    const margin = 40;

    // Masthead.
    context.fillStyle = INK;
    context.font = "600 34px Georgia, 'Times New Roman', serif";
    context.textBaseline = "top";
    context.fillText("The Chronicle.", margin, 38);

    context.fillStyle = RULE;
    context.font = "500 9px Helvetica, Arial, sans-serif";
    context.fillText("VOL. I  ·  THE DAILY EDITION", margin, 82);

    roundedRule(context, margin, 100, width - margin * 2, 3, INK);
    roundedRule(context, margin, 107, width - margin * 2, 1, RULE);

    // Headline — Chronicle's own copy, in the display serif.
    context.fillStyle = INK;
    context.font = "600 27px Georgia, 'Times New Roman', serif";
    const headline = ["The internet,", "edited down to a", "five-minute read."];
    headline.forEach((line, index) => {
      context.fillText(line, margin, 130 + index * 32);
    });

    // Byline.
    context.fillStyle = BRAND;
    context.font = "500 9px Helvetica, Arial, sans-serif";
    context.fillText("YOUR MORNING BRIEFING", margin, 232);

    // Two abstract columns of body copy (design element, not article text).
    const columnWidth = (width - margin * 2 - 18) / 2;
    const columnTop = 262;
    for (let column = 0; column < 2; column += 1) {
      const left = margin + column * (columnWidth + 18);
      for (let line = 0; line < 16; line += 1) {
        const remaining = 16 - line;
        const shrink = remaining === 1 ? 0.55 : remaining === 6 ? 0.75 : 1;
        roundedRule(
          context,
          left,
          columnTop + line * 11,
          columnWidth * shrink,
          3,
          "rgba(23,22,26,0.16)",
        );
      }
    }

    // A small graphic in the second column, the way an editorial page breaks up
    // body copy. A hairline frame with a brand-coloured area chart inside.
    const frameLeft = margin + columnWidth + 18;
    const frameTop = 440;
    const frameHeight = 58;
    roundedRule(context, frameLeft, frameTop, columnWidth, frameHeight, PAPER);
    roundedRule(context, frameLeft, frameTop, columnWidth, 1, RULE);
    roundedRule(context, frameLeft, frameTop + frameHeight - 1, columnWidth, 1, RULE);
    roundedRule(context, frameLeft, frameTop, 1, frameHeight, RULE);
    roundedRule(context, frameLeft + columnWidth - 1, frameTop, 1, frameHeight, RULE);
    context.fillStyle = "rgba(179,58,30,0.35)";
    context.beginPath();
    context.moveTo(frameLeft + 10, frameTop + frameHeight - 10);
    context.lineTo(frameLeft + columnWidth * 0.32, frameTop + 22);
    context.lineTo(frameLeft + columnWidth * 0.55, frameTop + 40);
    context.lineTo(frameLeft + columnWidth * 0.75, frameTop + 16);
    context.lineTo(frameLeft + columnWidth - 10, frameTop + frameHeight - 10);
    context.closePath();
    context.fill();

    // "Why it matters" band.
    roundedRule(context, margin, 530, width - margin * 2, 1, RULE);
    context.fillStyle = BRAND;
    context.font = "600 9px Helvetica, Arial, sans-serif";
    context.fillText("WHY IT MATTERS", margin, 542);
    for (let line = 0; line < 4; line += 1) {
      roundedRule(
        context,
        margin,
        562 + line * 11,
        (width - margin * 2) * (line === 3 ? 0.6 : 1),
        3,
        "rgba(23,22,26,0.16)",
      );
    }

    // Footer rule.
    roundedRule(context, margin, height - 34, width - margin * 2, 1, RULE);
    context.fillStyle = "rgba(23,22,26,0.45)";
    context.font = "500 8px Helvetica, Arial, sans-serif";
    context.fillText("CHRONICLE · SUMMARIZED BY AI · CHECK THE SOURCE", margin, height - 24);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
