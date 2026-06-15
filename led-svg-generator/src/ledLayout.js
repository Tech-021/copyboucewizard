const FONT_FAMILY = "Arial, Helvetica, sans-serif";
const FONT_SIZE = 180;
const CANVAS_HEIGHT = 260;
const LETTER_PADDING_X = 24;
const LETTER_GAP = 30;
const MODULE_WIDTH = 14;
const MODULE_HEIGHT = 9;
const MODULE_STEP_X = 18;
const MODULE_STEP_Y = 18;
const EDGE_CLEARANCE = 5;

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function buildLetterMask(letter) {
  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext("2d");

  if (!measureCtx) {
    throw new Error("Canvas context is not available.");
  }

  measureCtx.font = `400 ${FONT_SIZE}px ${FONT_FAMILY}`;
  const metrics = measureCtx.measureText(letter);
  const width = Math.ceil(metrics.width + LETTER_PADDING_X * 2);

  const canvas = createCanvas(width, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    throw new Error("Canvas context is not available.");
  }

  ctx.clearRect(0, 0, width, CANVAS_HEIGHT);
  ctx.fillStyle = "#000";
  ctx.font = `400 ${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, width / 2, CANVAS_HEIGHT / 2 + 4);

  const imageData = ctx.getImageData(0, 0, width, CANVAS_HEIGHT);
  const mask = new Uint8Array(width * CANVAS_HEIGHT);

  let left = width;
  let right = -1;
  let top = CANVAS_HEIGHT;
  let bottom = -1;

  for (let y = 0; y < CANVAS_HEIGHT; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = imageData.data[(y * width + x) * 4 + 3];
      if (alpha > 32) {
        const index = y * width + x;
        mask[index] = 1;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right < left || bottom < top) {
    left = 0;
    right = width - 1;
    top = 0;
    bottom = CANVAS_HEIGHT - 1;
  }

  return {
    width,
    height: CANVAS_HEIGHT,
    mask,
    bbox: { left, right, top, bottom },
  };
}

function insideMask(mask, width, height, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);

  if (ix < 0 || iy < 0 || ix >= width || iy >= height) {
    return false;
  }

  return mask[iy * width + ix] === 1;
}

function rectInsideMask(mask, width, height, x, y, rectWidth, rectHeight) {
  const sampleColumns = 4;
  const sampleRows = 3;

  for (let row = 0; row < sampleRows; row += 1) {
    for (let col = 0; col < sampleColumns; col += 1) {
      const sampleX = x + ((col + 0.5) / sampleColumns) * rectWidth;
      const sampleY = y + ((row + 0.5) / sampleRows) * rectHeight;

      if (!insideMask(mask, width, height, sampleX, sampleY)) {
        return false;
      }
    }
  }

  return true;
}

function placeModules(maskInfo) {
  const { width, height, mask, bbox } = maskInfo;
  const modules = [];
  const occupied = new Uint8Array(width * height);

  const startX = Math.max(EDGE_CLEARANCE, bbox.left - 2);
  const endX = Math.min(width - EDGE_CLEARANCE - MODULE_WIDTH, bbox.right + 2);
  const startY = Math.max(EDGE_CLEARANCE, bbox.top - 2);
  const endY = Math.min(height - EDGE_CLEARANCE - MODULE_HEIGHT, bbox.bottom + 2);

  for (let y = startY; y <= endY; y += MODULE_STEP_Y) {
    for (let x = startX; x <= endX; x += MODULE_STEP_X) {
      const left = x;
      const top = y;

      if (!rectInsideMask(mask, width, height, left, top, MODULE_WIDTH, MODULE_HEIGHT)) {
        continue;
      }

      let overlaps = false;
      for (let yy = top; yy < top + MODULE_HEIGHT && !overlaps; yy += 1) {
        for (let xx = left; xx < left + MODULE_WIDTH; xx += 1) {
          if (occupied[yy * width + xx] === 1) {
            overlaps = true;
            break;
          }
        }
      }

      if (overlaps) {
        continue;
      }

      for (let yy = top; yy < top + MODULE_HEIGHT; yy += 1) {
        for (let xx = left; xx < left + MODULE_WIDTH; xx += 1) {
          occupied[yy * width + xx] = 1;
        }
      }

      modules.push({
        x: left,
        y: top,
        width: MODULE_WIDTH,
        height: MODULE_HEIGHT,
        angleDeg: 0,
      });
    }
  }

  return modules;
}

export function buildLedLayout(text) {
  const letters = [...text];
  const layouts = [];
  let cursorX = 20;
  let totalModules = 0;

  for (const [index, letter] of letters.entries()) {
    if (letter === " ") {
      cursorX += 26;
      continue;
    }

    const maskInfo = buildLetterMask(letter);
    const modules = placeModules(maskInfo);

    layouts.push({
      letter,
      index,
      x: cursorX,
      width: maskInfo.width,
      height: maskInfo.height,
      count: modules.length,
      ledCount: modules.length * 3,
      modules,
    });

    totalModules += modules.length;
    cursorX += maskInfo.width + LETTER_GAP;
  }

  return {
    layouts,
    totalModules,
    svgWidth: Math.max(1100, cursorX + 20),
    svgHeight: 250,
  };
}
