import { parse as parseFont } from "opentype.js";
import antonFont from "../assets/fonts/Anton-Regular.ttf?url";

const FONT_CACHE = new Map();

async function loadFont(url) {
  let cached = FONT_CACHE.get(url);
  if (!cached) {
    cached = fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load font: ${res.status} ${res.statusText}`);
        }
        return res.arrayBuffer();
      })
      .then((buffer) => parseFont(buffer));
    FONT_CACHE.set(url, cached);
  }
  return cached;
}

function translateCommands(commands, dx, dy) {
  for (const c of commands) {
    switch (c.type) {
      case "C":
        c.x1 -= dx;
        c.y1 -= dy;
        c.x2 -= dx;
        c.y2 -= dy;
        c.x -= dx;
        c.y -= dy;
        break;
      case "Q":
        c.x1 -= dx;
        c.y1 -= dy;
        c.x -= dx;
        c.y -= dy;
        break;
      case "M":
      case "L":
        c.x -= dx;
        c.y -= dy;
        break;
      default:
        break;
    }
  }
}

/**
 * Convert typed text into per-glyph SVG paths with preserved kerning/advance.
 * Each glyph is normalized to its own bounding box so the LED engine can place
 * modules letter-by-letter, matching the reference repo's grouped behavior.
 */
export async function textToSvgPath(text, fontId = "anton") {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const fontUrl = fontId === "anton" ? antonFont : antonFont;
  const font = await loadFont(fontUrl);
  if (!font || typeof font.forEachGlyph !== "function") {
    throw new Error("Font loader returned an invalid font object");
  }

  const fontSize = 1000;
  const glyphs = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  font.forEachGlyph(trimmed, 0, fontSize, fontSize, { kerning: true }, (glyph, x, y, size) => {
    if (!glyph || glyph.index === 0) return;

    const path = glyph.getPath(x, y, size);
    const bb = path.getBoundingBox();
    const widthUnits = bb.x2 - bb.x1;
    const heightUnits = bb.y2 - bb.y1;
    if (!(widthUnits > 0) || !(heightUnits > 0)) return;

    translateCommands(path.commands, bb.x1, bb.y1);

    glyphs.push({
      char: glyph.unicode ? String.fromCodePoint(glyph.unicode) : "",
      pathData: path.toPathData(2),
      viewBox: `0 0 ${widthUnits.toFixed(2)} ${heightUnits.toFixed(2)}`,
      xOffset: bb.x1,
      yOffset: bb.y1,
      widthUnits,
      heightUnits,
    });

    minX = Math.min(minX, bb.x1);
    minY = Math.min(minY, bb.y1);
    maxX = Math.max(maxX, bb.x2);
    maxY = Math.max(maxY, bb.y2);
  });

  if (!glyphs.length) return null;

  return {
    glyphs,
    pathData: glyphs.map((g) => `M ${g.xOffset} ${g.yOffset} ${g.pathData}`).join(" "),
    viewBox: `${minX.toFixed(2)} ${minY.toFixed(2)} ${(maxX - minX).toFixed(2)} ${(maxY - minY).toFixed(2)}`,
    widthUnits: maxX - minX,
    heightUnits: maxY - minY,
  };
}
