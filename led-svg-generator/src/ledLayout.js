const FONT_FAMILY = "Arial, Helvetica, sans-serif";
const FONT_SIZE = 180;
const CANVAS_HEIGHT = 260;
const LETTER_PADDING_X = 24;
const LETTER_GAP = 30;

const DOT_SPACING_X = 4;
const DOT_SPACING_Y = 4;
const DOT_RADIUS = 1.8;
const DOT_CLEARANCE = 0.2;

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function buildLetterMask(letter) {
  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext("2d");

  measureCtx.font = `400 ${FONT_SIZE}px ${FONT_FAMILY}`;
  const metrics = measureCtx.measureText(letter);

  const width = Math.ceil(metrics.width + LETTER_PADDING_X * 2);

  const canvas = createCanvas(width, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.clearRect(0, 0, width, CANVAS_HEIGHT);

  ctx.fillStyle = "#000";
  ctx.font = `400 ${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText(
    letter,
    width / 2,
    CANVAS_HEIGHT / 2 + 4
  );

  const imageData = ctx.getImageData(
    0,
    0,
    width,
    CANVAS_HEIGHT
  );

  const mask = new Uint8Array(width * CANVAS_HEIGHT);

  let left = width;
  let right = -1;
  let top = CANVAS_HEIGHT;
  let bottom = -1;

  for (let y = 0; y < CANVAS_HEIGHT; y++) {
    for (let x = 0; x < width; x++) {
      const alpha =
        imageData.data[
          (y * width + x) * 4 + 3
        ];

      if (alpha > 8) {
        mask[y * width + x] = 1;

        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return {
    width,
    height: CANVAS_HEIGHT,
    mask,
    bbox: {
      left,
      right,
      top,
      bottom,
    },
  };
}

function isInsideLetter(mask, width, height, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);

  if (
    ix <= 1 ||
    iy <= 1 ||
    ix >= width - 2 ||
    iy >= height - 2
  ) {
    return false;
  }

  return mask[iy * width + ix] === 1;
}

function circleInsideMask(mask, width, height, x, y, radius) {
  const samples = 32;
  const safetyRadius = radius + DOT_CLEARANCE;

  if (!isInsideLetter(mask, width, height, x, y)) {
    return false;
  }

  for (let i = 0; i < samples; i += 1) {
    const angle = (Math.PI * 2 * i) / samples;
    const sampleX = x + Math.cos(angle) * safetyRadius;
    const sampleY = y + Math.sin(angle) * safetyRadius;

    if (!isInsideLetter(mask, width, height, sampleX, sampleY)) {
      return false;
    }
  }

  return true;
}

function placeModules(maskInfo) {
  const { width, height, mask, bbox } =
    maskInfo;

  const modules = [];
  const offsets = [
    [0, 0],
    [DOT_SPACING_X / 2, 0],
    [0, DOT_SPACING_Y / 2],
    [DOT_SPACING_X / 2, DOT_SPACING_Y / 2],
  ];

  for (const [offsetX, offsetY] of offsets) {
    for (let y = bbox.top + DOT_RADIUS + DOT_CLEARANCE + offsetY; y <= bbox.bottom - DOT_RADIUS - DOT_CLEARANCE; y += DOT_SPACING_Y) {
      for (let x = bbox.left + DOT_RADIUS + DOT_CLEARANCE + offsetX; x <= bbox.right - DOT_RADIUS - DOT_CLEARANCE; x += DOT_SPACING_X) {
        if (circleInsideMask(mask, width, height, x, y, DOT_RADIUS)) {
          modules.push({ x, y, r: DOT_RADIUS });
        }
      }
    }
  }

  return modules;
}

export function buildLedLayout(text) {
  const layouts = [];

  let cursorX = 20;
  let totalModules = 0;

  for (const [index, letter] of [...text].entries()) {
    if (letter === " ") {
      cursorX += 30;
      continue;
    }

    const maskInfo =
      buildLetterMask(letter);

    const modules =
      placeModules(maskInfo);

    layouts.push({
      letter,
      index,
      x: cursorX,
      width: maskInfo.width,
      height: maskInfo.height,
      count: modules.length,
      modules,
    });

    totalModules += modules.length;

    cursorX +=
      maskInfo.width +
      LETTER_GAP;
  }

  return {
    layouts,
    totalModules,
    svgWidth: Math.max(
      1100,
      cursorX + 20
    ),
    svgHeight: 250,
  };
}
