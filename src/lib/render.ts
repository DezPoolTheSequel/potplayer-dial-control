/**
 * Draws the dial screen pieces as SVG pixmaps. Layout `bar`/`text` items
 * can't put text inside a bar, so the bars are drawn by hand here.
 *
 * Text gets a dark outline ("halo") drawn underneath it so it stays readable
 * on both the filled and the empty part of a bar, whatever fill colour the
 * user picks. This avoids clipPath, which Stream Deck's SVG renderer may not
 * support.
 */

export const SCREEN_WIDTH = 200;
export const BAR_HEIGHT = 26;
export const TITLE_HEIGHT = 26;

const BAR_MARGIN_X = 6;
const FONT_FAMILY = "Segoe UI, Arial, Helvetica, sans-serif";
const BAR_BG = "#2b2b2b";
const TEXT_COLOR = "#FFFFFF";
const HALO_COLOR = "#000000";

export const TITLE_FONT_SIZE = 15;
const BAR_FONT_SIZE = 15;
/** Gap between the end of the title and its repeat when scrolling. */
export const TITLE_GAP = 40;
/** Left/right breathing room for the title. */
export const TITLE_PAD = 6;

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function svgDoc(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

type Anchor = "start" | "middle" | "end";

/** Text with a dark outline behind it (drawn as a stroked copy, then the plain fill on top). */
function haloText(text: string, x: number, y: number, size: number, anchor: Anchor, color = TEXT_COLOR): string {
  const common = `x="${x}" y="${y}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="bold" text-anchor="${anchor}"`;
  const t = escapeXml(text);
  return (
    `<text ${common} fill="${HALO_COLOR}" stroke="${HALO_COLOR}" stroke-width="3" stroke-linejoin="round">${t}</text>` +
    `<text ${common} fill="${color}">${t}</text>`
  );
}

function barShapes(percent: number, fillColor: string): string {
  const w = SCREEN_WIDTH - BAR_MARGIN_X * 2;
  const fillW = Math.round((w * Math.max(0, Math.min(100, percent))) / 100);
  const bg = `<rect x="${BAR_MARGIN_X}" y="0" width="${w}" height="${BAR_HEIGHT}" rx="5" ry="5" fill="${BAR_BG}"/>`;
  const fill =
    fillW > 0
      ? `<rect x="${BAR_MARGIN_X}" y="0" width="${fillW}" height="${BAR_HEIGHT}" rx="5" ry="5" fill="${escapeXml(fillColor)}"/>`
      : "";
  return bg + fill;
}

const TEXT_BASELINE = Math.round(BAR_HEIGHT / 2 + BAR_FONT_SIZE * 0.36);

/** Volume bar with its label centered inside. */
export function renderVolumeBar(percent: number, label: string, fillColor: string): string {
  const body = barShapes(percent, fillColor) + haloText(label, SCREEN_WIDTH / 2, TEXT_BASELINE, BAR_FONT_SIZE, "middle");
  return toDataUri(svgDoc(SCREEN_WIDTH, BAR_HEIGHT, body));
}

/** Progress bar with elapsed time on the left and total time on the right. */
export function renderTimeBar(percent: number, elapsed: string, total: string, fillColor: string): string {
  const pad = BAR_MARGIN_X + 6;
  const body =
    barShapes(percent, fillColor) +
    haloText(elapsed, pad, TEXT_BASELINE, BAR_FONT_SIZE, "start") +
    haloText(total, SCREEN_WIDTH - pad, TEXT_BASELINE, BAR_FONT_SIZE, "end");
  return toDataUri(svgDoc(SCREEN_WIDTH, BAR_HEIGHT, body));
}

/**
 * Title line. When `scrollOffset` is null the text is centered (it fits);
 * otherwise it's drawn left-aligned shifted by the offset, followed by a
 * second copy so the marquee loops seamlessly. Anything outside the pixmap
 * is clipped by the pixmap's own bounds.
 */
export function renderTitle(title: string, textWidth: number, scrollOffset: number | null, dim = false): string {
  const y = Math.round(TITLE_HEIGHT / 2 + TITLE_FONT_SIZE * 0.36);
  const color = dim ? "#9a9a9a" : TEXT_COLOR;
  let body: string;
  if (scrollOffset === null) {
    body = haloText(title, SCREEN_WIDTH / 2, y, TITLE_FONT_SIZE, "middle", color);
  } else {
    const x1 = TITLE_PAD - scrollOffset;
    const x2 = x1 + textWidth + TITLE_GAP;
    body = haloText(title, x1, y, TITLE_FONT_SIZE, "start", color) + haloText(title, x2, y, TITLE_FONT_SIZE, "start", color);
  }
  return toDataUri(svgDoc(SCREEN_WIDTH, TITLE_HEIGHT, body));
}

// Approximate Helvetica/Arial advance widths (per 1000 em) for ASCII 32..126.
// The plugin process has no font metrics, so this is used to decide whether
// the title fits and how far the marquee needs to travel.
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // space .. /
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, // 0..9
  278, 278, 584, 584, 584, 556, 1015, // : .. @
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, // A..Z
  278, 278, 278, 469, 556, 333, // [ .. `
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500,
  722, 500, 500, 500, // a..z
  334, 260, 334, 584, // { | } ~
];

/** Estimated rendered width in px of `text` in the bold title font. */
export function estimateTextWidth(text: string, fontSize = TITLE_FONT_SIZE): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code <= 126) units += ASCII_WIDTHS[code - 32];
    else if (code >= 0x2e80) units += 1000; // CJK and other wide scripts
    else units += 600;
  }
  // Bold is roughly 7% wider than regular.
  return (units / 1000) * fontSize * 1.07;
}
