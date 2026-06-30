const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * @typedef {{ x: number; y: number; angleDeg: number }} ModulePlacement
 */

/**
 * Build LED module placements for a rigid rectangular module footprint.
 * The engine accepts raw SVG path data and a viewBox, rasterises the fill
 * with even-odd rules, traces the skeleton, then places oriented rectangles
 * along the stroke axis with collision checks.
 *
 * @param {object} opts
 * @param {string} opts.pathData
 * @param {string} opts.viewBox
 * @param {number} opts.letterWidthMm
 * @param {number} opts.letterHeightMm
 * @param {number} opts.moduleLengthMm
 * @param {number} opts.moduleWidthMm
 * @param {number} opts.edgeClearanceMm
 * @param {number} opts.targetDensity
 * @param {"fill"|"single"} [opts.mode]
 * @param {number} [opts.targetRasterPx]
 * @returns {{
 *   positions: ModulePlacement[];
 *   totalModules: number;
 *   svgWidth: number;
 *   svgHeight: number;
 * }}
 */
export function buildLedLayout(opts) {
  const {
    pathData,
    viewBox,
    letterWidthMm,
    letterHeightMm,
    moduleLengthMm,
    moduleWidthMm,
    edgeClearanceMm,
    targetDensity,
    mode = "fill",
    targetRasterPx = 320,
    targetCount,
  } = opts;

  const [vbX, vbY, vbW, vbH] = parseViewBox(viewBox);
  if (!(vbW > 0) || !(vbH > 0)) {
    return emptyLayout(vbW, vbH);
  }
  if (
    !(letterWidthMm > 0) ||
    !(letterHeightMm > 0) ||
    !(moduleLengthMm > 0) ||
    !(moduleWidthMm > 0)
  ) {
    return emptyLayout(vbW, vbH);
  }

  const density = clamp(Number(targetDensity) || 1, 0.4, 2.5);
  const scaleX = vbW / letterWidthMm;
  const scaleY = vbH / letterHeightMm;
  const svgPerMm = Math.min(scaleX, scaleY);

  const pxPerSvg = clampRasterScale(targetRasterPx / vbH, vbW, vbH);
  const W = Math.max(8, Math.round(vbW * pxPerSvg));
  const H = Math.max(8, Math.round(vbH * pxPerSvg));
  const pxPerMm = svgPerMm * pxPerSvg;

  const moduleLengthPx = moduleLengthMm * pxPerMm;
  const moduleWidthPx = moduleWidthMm * pxPerMm;
  const clearancePx = Math.max(0, edgeClearanceMm) * pxPerMm;

  // Higher density means tighter spacing. We keep it bounded by the module
  // length so the rectangles remain rigid and visually consistent.
  const pitchMm = moduleLengthMm / density;
  const pitchPx = pitchMm * pxPerMm;
  if (!(pitchPx > 0)) return emptyLayout(vbW, vbH);

  const svgEl = document.createElementNS(SVG_NS, "svg");
  svgEl.setAttribute("viewBox", viewBox);
  svgEl.setAttribute("width", String(vbW));
  svgEl.setAttribute("height", String(vbH));
  svgEl.style.cssText =
    "position:absolute;left:-9999px;top:-9999px;opacity:0;pointer-events:none";
  document.body.appendChild(svgEl);

  try {
    const mask = rasterizeFill(pathData, vbX, vbY, pxPerSvg, W, H);
    if (!mask) return emptyLayout(vbW, vbH);

    const distSq = edt2d(mask, W, H);
    const skel = zhangSuenThin(mask, W, H);
    pruneSpurs(skel, W, H, pitchPx * 0.6);

    const branches = stitchBranches(traceSkeleton(skel, W, H), pitchPx * 2.5);
    const modules = placeRuns(branches, distSq, W, H, {
      pitchPx,
      clearancePx,
      moduleLengthPx,
      moduleWidthPx,
      mode,
      targetCount,
      vbX,
      vbY,
      pxPerSvg,
      scaleX,
      scaleY,
    });

    rescueSmallShapes(modules, mask, distSq, W, H, clearancePx + moduleWidthPx / 2);

    const positions = modules.map((m) => ({
      x: m.x,
      y: m.y,
      angleDeg: (m.ang * 180) / Math.PI,
    }));

    return {
      positions,
      totalModules: positions.length,
      svgWidth: vbW,
      svgHeight: vbH,
    };
  } finally {
    document.body.removeChild(svgEl);
  }
}

function emptyLayout(vbW, vbH) {
  return {
    positions: [],
    totalModules: 0,
    svgWidth: vbW > 0 ? vbW : 0,
    svgHeight: vbH > 0 ? vbH : 0,
  };
}

function parseViewBox(viewBox) {
  const parts = String(viewBox || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return [0, 0, 0, 0];
  }
  return parts;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampRasterScale(scale, vbW, vbH) {
  const MAX_PIXELS = 1_200_000;
  const total = vbW * scale * (vbH * scale);
  if (total > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / total);
  return Math.max(scale, 1e-4);
}

function rasterizeFill(pathData, vbX, vbY, scale, W, H) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-vbX, -vbY);
  ctx.fill(new Path2D(pathData), "evenodd");
  ctx.restore();

  const data = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  return mask;
}

function edt1d(f, n) {
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s =
      (f[q] + q * q - (f[v[k]] + v[k] * v[k])) /
      (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s =
        (f[q] + q * q - (f[v[k]] + v[k] * v[k])) /
        (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dist = q - v[k];
    d[q] = dist * dist + f[v[k]];
  }
  return d;
}

function edt2d(mask, W, H) {
  const INF = 1e20;
  const f = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) f[i] = mask[i] ? INF : 0;

  const col = new Float64Array(H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) col[y] = f[y * W + x];
    const d = edt1d(col, H);
    for (let y = 0; y < H; y++) f[y * W + x] = d[y];
  }

  const row = new Float64Array(W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) row[x] = f[y * W + x];
    const d = edt1d(row, W);
    for (let x = 0; x < W; x++) f[y * W + x] = d[x];
  }
  return f;
}

function zhangSuenThin(mask, W, H) {
  const img = Uint8Array.from(mask);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : img[y * W + x]);

  let changed = true;
  const toClear = [];
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      toClear.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          if (img[y * W + x] !== 1) continue;
          const p2 = at(x, y - 1);
          const p3 = at(x + 1, y - 1);
          const p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1);
          const p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y);
          const p9 = at(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let A = 0;
          for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) A++;
          if (A !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          toClear.push(y * W + x);
        }
      }
      if (toClear.length) {
        changed = true;
        for (const idx of toClear) img[idx] = 0;
      }
    }
  }
  return img;
}

const NB8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

function traceSkeleton(skel, W, H) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : skel[y * W + x]);
  const deg = (x, y) => {
    let d = 0;
    for (const [dx, dy] of NB8) if (at(x + dx, y + dy)) d++;
    return d;
  };
  const isNode = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (skel[y * W + x] && deg(x, y) !== 2) isNode[y * W + x] = 1;
    }
  }
  const used = new Set();
  const vis = new Uint8Array(W * H);
  const branches = [];
  const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!skel[y * W + x] || !isNode[y * W + x]) continue;
      vis[y * W + x] = 1;
      for (const [dx, dy] of NB8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!at(nx, ny)) continue;
        if (used.has(ek(y * W + x, ny * W + nx))) continue;
        let px = x;
        let py = y;
        let cx = nx;
        let cy = ny;
        used.add(ek(py * W + px, cy * W + cx));
        const br = [[x, y], [nx, ny]];
        vis[cy * W + cx] = 1;
        let guard = 0;
        while (!isNode[cy * W + cx] && guard++ < W * H) {
          let moved = false;
          for (const [ex, ey] of NB8) {
            const ax = cx + ex;
            const ay = cy + ey;
            if (!at(ax, ay)) continue;
            if (ax === px && ay === py) continue;
            if (used.has(ek(cy * W + cx, ay * W + ax))) continue;
            px = cx;
            py = cy;
            cx = ax;
            cy = ay;
            used.add(ek(py * W + px, cy * W + cx));
            br.push([cx, cy]);
            vis[cy * W + cx] = 1;
            moved = true;
            break;
          }
          if (!moved) break;
        }
        const lp = br[br.length - 1];
        branches.push({ pts: br, dStart: deg(x, y), dEnd: deg(lp[0], lp[1]) });
      }
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!skel[y * W + x] || vis[y * W + x]) continue;
      let px = -1;
      let py = -1;
      let cx = x;
      let cy = y;
      const br = [[x, y]];
      vis[y * W + x] = 1;
      let guard = 0;
      while (guard++ < W * H) {
        let moved = false;
        for (const [ex, ey] of NB8) {
          const ax = cx + ex;
          const ay = cy + ey;
          if (!at(ax, ay)) continue;
          if (ax === px && ay === py) continue;
          if (vis[ay * W + ax]) continue;
          px = cx;
          py = cy;
          cx = ax;
          cy = ay;
          vis[cy * W + cx] = 1;
          br.push([cx, cy]);
          moved = true;
          break;
        }
        if (!moved) break;
      }
      if (br.length >= 3) branches.push({ pts: br, dStart: 2, dEnd: 2 });
    }
  }

  return branches;
}

function stitchBranches(branches, tol) {
  const B = branches.map((b) => ({
    pts: b.pts.map((p) => [p[0], p[1]]),
    dStart: b.dStart,
    dEnd: b.dEnd,
    dead: false,
  }));
  const key = (p) => `${Math.round(p[0] / 2)}_${Math.round(p[1] / 2)}`;
  const dirAt = (pts, start) => {
    const n = pts.length;
    const k = Math.min(6, n - 1);
    const a = start ? pts[0] : pts[n - 1];
    const b = start ? pts[k] : pts[n - 1 - k];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  const angDiff = (a, b) => {
    let d = Math.abs(a - b) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  };
  const endPt = (i, atStart) => (atStart ? B[i].pts[0] : B[i].pts[B[i].pts.length - 1]);

  const index = new Map();
  const addEnd = (i, atStart) => {
    const k = key(endPt(i, atStart));
    let arr = index.get(k);
    if (!arr) {
      arr = [];
      index.set(k, arr);
    }
    arr.push({ i, atStart });
  };
  for (let i = 0; i < B.length; i++) {
    addEnd(i, true);
    addEnd(i, false);
  }

  const queue = [];
  for (let i = 0; i < B.length; i++) queue.push(i);
  while (queue.length) {
    const i = queue.pop();
    if (B[i].dead) continue;
    let mergedAny = false;
    for (const atStart of [true, false]) {
      const p = endPt(i, atStart);
      const arr = index.get(key(p));
      if (!arr) continue;
      for (const cand of arr) {
        const j = cand.i;
        if (j === i || B[j].dead) continue;
        if (key(endPt(j, cand.atStart)) !== key(p)) continue;
        const di = dirAt(B[i].pts, atStart);
        const dj = dirAt(B[j].pts, cand.atStart);
        if (angDiff(di, dj + Math.PI) >= tol) continue;
        const ip = atStart ? B[i].pts.slice().reverse() : B[i].pts.slice();
        const jp = cand.atStart ? B[j].pts.slice() : B[j].pts.slice().reverse();
        B[i].pts = ip.concat(jp.slice(1));
        B[i].dStart = atStart ? B[i].dEnd : B[i].dStart;
        B[i].dEnd = cand.atStart ? B[j].dEnd : B[j].dStart;
        B[j].dead = true;
        addEnd(i, true);
        addEnd(i, false);
        mergedAny = true;
        break;
      }
      if (mergedAny) break;
    }
    if (mergedAny) queue.push(i);
  }

  return B.filter((b) => !b.dead).map((b) => ({
    pts: b.pts,
    dStart: b.dStart,
    dEnd: b.dEnd,
  }));
}

function smoothOpen(poly, iter) {
  if (poly.length < 3) return poly.map((q) => [q[0], q[1]]);
  let p = poly.map((q) => [q[0], q[1]]);
  for (let it = 0; it < iter; it++) {
    const o = p.map((q) => [q[0], q[1]]);
    for (let i = 1; i < p.length - 1; i++) {
      o[i] = [
        (p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4,
        (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4,
      ];
    }
    p = o;
  }
  return p;
}

function splitAtCorners(pts, winPx) {
  const n = pts.length;
  if (n < 6) return [pts];
  const cum = [0];
  for (let i = 1; i < n; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = cum[n - 1];
  const win = Math.max(winPx * 0.6, 4);
  if (total < win * 2.5) return [pts];
  const thresh = (45 * Math.PI) / 180;
  const idxAtArc = (target) => {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m] < target) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  const turnAt = (i) => {
    if (cum[i] < win || total - cum[i] < win) return 0;
    const ai = idxAtArc(cum[i] - win);
    const bi = idxAtArc(cum[i] + win);
    if (ai >= i || bi <= i) return 0;
    const inA = Math.atan2(pts[i][1] - pts[ai][1], pts[i][0] - pts[ai][0]);
    const outA = Math.atan2(pts[bi][1] - pts[i][1], pts[bi][0] - pts[i][0]);
    let d = Math.abs(outA - inA);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  };

  const corners = [];
  let i = 0;
  while (i < n) {
    if (turnAt(i) < thresh) {
      i++;
      continue;
    }
    let j = i;
    let bestIdx = i;
    let bestT = turnAt(i);
    while (j < n && turnAt(j) >= thresh) {
      const t = turnAt(j);
      if (t > bestT) {
        bestT = t;
        bestIdx = j;
      }
      j++;
    }
    corners.push(bestIdx);
    i = j;
  }
  if (corners.length === 0) return [pts];
  const segs = [];
  let start = 0;
  for (const c of corners) {
    if (c - start + 1 >= 3) segs.push(pts.slice(start, c + 1));
    start = c;
  }
  if (n - start >= 3) segs.push(pts.slice(start));
  return segs.length ? segs : [pts];
}

function placeRuns(branches, distSq, W, H, cfg) {
  const {
    pitchPx,
    clearancePx,
    moduleLengthPx,
    moduleWidthPx,
    mode,
    targetCount,
  } = cfg;

  const spc = Math.max(pitchPx, moduleLengthPx + pitchPx * 0.2);
  const setback = clearancePx + moduleWidthPx / 2;
  const edgeMarginPx = Math.max(1, clearancePx * 0.4);

  const sd = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) {
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0;
      return Math.sqrt(distSq[yi * W + xi]);
    }
    const fx = x - x0;
    const fy = y - y0;
    const d00 = Math.sqrt(distSq[y0 * W + x0]);
    const d10 = Math.sqrt(distSq[y0 * W + x0 + 1]);
    const d01 = Math.sqrt(distSq[(y0 + 1) * W + x0]);
    const d11 = Math.sqrt(distSq[(y0 + 1) * W + x0 + 1]);
    return (
      d00 * (1 - fx) * (1 - fy) +
      d10 * fx * (1 - fy) +
      d01 * (1 - fx) * fy +
      d11 * fx * fy
    );
  };

  const mods = [];
  const cell = pitchPx * 0.7;
  const grid = new Map();
  const near = (x, y) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const r2 = (pitchPx * 0.6) * (pitchPx * 0.6);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = grid.get(`${gx + a}_${gy + b}`);
        if (!arr) continue;
        for (const m of arr) {
          if ((m[0] - x) ** 2 + (m[1] - y) ** 2 < r2) return true;
        }
      }
    }
    return false;
  };
  const add = (x, y, ang) => {
    if (near(x, y)) return;
    const k = `${Math.floor(x / cell)}_${Math.floor(y / cell)}`;
    let arr = grid.get(k);
    if (!arr) {
      arr = [];
      grid.set(k, arr);
    }
    arr.push([x, y]);
    mods.push({ x, y, ang });
  };

  const footprintInside = (mx, my, ang) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const hl = moduleLengthPx / 2;
    const hw = moduleWidthPx / 2;
    const corners = [
      [hl, hw],
      [hl, -hw],
      [-hl, hw],
      [-hl, -hw],
      [hl, 0],
      [-hl, 0],
      [0, hw],
      [0, -hw],
    ];
    for (const [a, b] of corners) {
      const X = mx + c * a - s * b;
      const Y = my + s * a + c * b;
      if (sd(X, Y) < edgeMarginPx) return false;
    }
    return true;
  };

  for (const B of branches) {
    const raw = B.pts;
    const br = smoothOpen(raw, 6);
    const segments = splitAtCorners(br, moduleLengthPx);

    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (seg.length < 2) continue;

      let total = 0;
      for (let i = 0; i < seg.length - 1; i++) {
        total += Math.hypot(seg[i + 1][0] - seg[i][0], seg[i + 1][1] - seg[i][1]);
      }
      if (total < Math.max(pitchPx * 0.8, moduleLengthPx * 1.1)) continue;

      const startIsJunction = si === 0 && B.dStart >= 3;
      const endIsJunction = si === segments.length - 1 && B.dEnd >= 3;
      const tS = startIsJunction ? moduleLengthPx * 0.25 : clearancePx + moduleLengthPx / 2;
      const tE = endIsJunction ? moduleLengthPx * 0.25 : clearancePx + moduleLengthPx / 2;
      const startS = Math.min(tS, total * 0.4);
      const endS = total - Math.min(tE, total * 0.4);

      const ws = seg.map((p) => 2 * sd(p[0], p[1])).sort((a, b) => a - b);
      const medW = ws[Math.floor(ws.length / 2)] || 0;

      const acrossPitch = moduleWidthPx + clearancePx;
      const lanes = mode === "single"
        ? 1
        : Math.max(1, Math.min(6, Math.floor((medW - 2 * setback) / acrossPitch) + 1));
      const laneOffsets = [];
      for (let k = 0; k < lanes; k++) {
        laneOffsets.push((k - (lanes - 1) / 2) * acrossPitch);
      }

      const count = targetCount
        ? Math.max(1, Math.round((endS - startS) / total * targetCount))
        : Math.max(1, Math.floor((endS - startS) / spc));

      const cumLen = [0];
      for (let i = 1; i < seg.length; i++) {
        cumLen.push(cumLen[i - 1] + Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]));
      }

      const segAngles = new Array(seg.length);
      for (let i = 0; i < seg.length; i++) {
        if (i === 0) {
          segAngles[i] = Math.atan2(seg[1][1] - seg[0][1], seg[1][0] - seg[0][0]);
        } else if (i === seg.length - 1) {
          segAngles[i] = Math.atan2(seg[i][1] - seg[i - 1][1], seg[i][0] - seg[i - 1][0]);
        } else {
          const a1 = Math.atan2(seg[i][1] - seg[i - 1][1], seg[i][0] - seg[i - 1][0]);
          const a2 = Math.atan2(seg[i + 1][1] - seg[i][1], seg[i + 1][0] - seg[i][0]);
          let d = a2 - a1;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          segAngles[i] = a1 + d * 0.5;
        }
      }

      for (let i = 0; i < count; i++) {
        const targetLen = startS + (i + 0.5) * ((endS - startS) / count);
        if (targetLen > endS) break;

        let lo = 0;
        let hi = cumLen.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (cumLen[mid] < targetLen) lo = mid + 1;
          else hi = mid;
        }
        const segIdx = lo - 1;
        if (segIdx < 0) continue;

        const a = seg[segIdx];
        const b = seg[segIdx + 1];
        const segLen = cumLen[segIdx + 1] - cumLen[segIdx];
        const t = segLen > 0 ? (targetLen - cumLen[segIdx]) / segLen : 0;
        const x = a[0] + (b[0] - a[0]) * t;
        const y = a[1] + (b[1] - a[1]) * t;
        const ang = segAngles[segIdx] + (segAngles[segIdx + 1] - segAngles[segIdx]) * t;

        const nx = Math.cos(ang + Math.PI / 2);
        const ny = Math.sin(ang + Math.PI / 2);

        for (let k = 0; k < lanes; k++) {
          const offset = laneOffsets[k];
          const mx = x + nx * offset;
          const my = y + ny * offset;
          if (Math.abs(offset) < acrossPitch * 0.5 || sd(mx, my) >= setback * 0.55) {
            if (footprintInside(mx, my, ang)) add(mx, my, ang);
          }
        }
      }
    }
  }

  const outR2 = (moduleLengthPx * 1.8) * (moduleLengthPx * 1.8);
  const agreeTol = (28 * Math.PI) / 180;
  const kept = [];
  for (let i = 0; i < mods.length; i++) {
    const m = mods[i];
    let neigh = 0;
    let agree = 0;
    for (let j = 0; j < mods.length; j++) {
      if (j === i) continue;
      const dx = mods[j].x - m.x;
      const dy = mods[j].y - m.y;
      if (dx * dx + dy * dy > outR2) continue;
      neigh++;
      let d = Math.abs(mods[j].ang - m.ang) % Math.PI;
      if (d > Math.PI / 2) d = Math.PI - d;
      if (d < agreeTol) agree++;
    }
    if (neigh >= 2 && agree === 0) continue;
    kept.push(m);
  }

  const final = [];
  const finalCorners = [];
  const reach2 = (moduleLengthPx + moduleWidthPx) * (moduleLengthPx + moduleWidthPx);
  for (const m of kept) {
    const corners = rectCorners(m.x, m.y, m.ang, moduleLengthPx, moduleWidthPx, 0.9);
    let collide = false;
    for (let k = 0; k < final.length; k++) {
      const dx = final[k].x - m.x;
      const dy = final[k].y - m.y;
      if (dx * dx + dy * dy > reach2) continue;
      if (satOverlap(corners, finalCorners[k])) {
        collide = true;
        break;
      }
    }
    if (!collide) {
      final.push(m);
      finalCorners.push(corners);
    }
  }

  return final;
}

function rectCorners(x, y, angRad, lenSvg, widSvg, scale) {
  const c = Math.cos(angRad);
  const s = Math.sin(angRad);
  const hl = (lenSvg / 2) * scale;
  const hw = (widSvg / 2) * scale;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sl, sw]) => [
    x + c * hl * sl - s * hw * sw,
    y + s * hl * sl + c * hw * sw,
  ]);
}

function satOverlap(A, B) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const nx = -(p2[1] - p1[1]);
      const ny = p2[0] - p1[0];
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const p of A) {
        const d = p[0] * nx + p[1] * ny;
        if (d < minA) minA = d;
        if (d > maxA) maxA = d;
      }
      for (const p of B) {
        const d = p[0] * nx + p[1] * ny;
        if (d < minB) minB = d;
        if (d > maxB) maxB = d;
      }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

function pruneSpurs(skel, W, H, minLenPx) {
  const idx = (x, y) => y * W + x;
  const nbrs = (x, y) => {
    const r = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (skel[idx(nx, ny)] === 1) r.push([nx, ny]);
      }
    }
    return r;
  };

  let changed = true;
  let guard = 0;
  while (changed && guard++ < 64) {
    changed = false;
    const deg = new Int8Array(W * H);
    const endpoints = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (skel[idx(x, y)] !== 1) continue;
        const d = nbrs(x, y).length;
        deg[idx(x, y)] = d;
        if (d === 1) endpoints.push([x, y]);
      }
    }
    for (const [ex, ey] of endpoints) {
      if (skel[idx(ex, ey)] !== 1) continue;
      const branch = [[ex, ey]];
      let cx = ex;
      let cy = ey;
      let prev = -1;
      let hitJunction = false;
      while (true) {
        const ns = nbrs(cx, cy).filter(([nx, ny]) => idx(nx, ny) !== prev);
        if (ns.length !== 1) break;
        const [nx, ny] = ns[0];
        if (deg[idx(nx, ny)] >= 3) {
          hitJunction = true;
          break;
        }
        prev = idx(cx, cy);
        cx = nx;
        cy = ny;
        branch.push([cx, cy]);
        if (deg[idx(cx, cy)] === 1) break;
      }
      if (hitJunction && branch.length < minLenPx) {
        for (const [bx, by] of branch) skel[idx(bx, by)] = 0;
        changed = true;
      }
    }
  }
}

function rescueSmallShapes(mods, ink, distSq, W, H, setback) {
  const { lab, comps } = labelComponents(ink, distSq, W, H);
  const covered = new Set();
  for (const m of mods) {
    const xi = Math.round(m.x);
    const yi = Math.round(m.y);
    if (xi >= 0 && yi >= 0 && xi < W && yi < H) {
      const id = lab[yi * W + xi];
      if (id) covered.add(id);
    }
  }
  for (let id = 1; id < comps.length; id++) {
    const c = comps[id];
    if (!c || covered.has(id)) continue;
    if (c.maxV >= setback * 0.45 && c.count >= 8) {
      const ang = c.maxx - c.minx >= c.maxy - c.miny ? 0 : Math.PI / 2;
      mods.push({ x: c.mx, y: c.my, ang });
    }
  }
}

function labelComponents(ink, distSq, W, H) {
  const lab = new Int32Array(W * H);
  const comps = [null];
  let next = 0;
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!ink[i] || lab[i]) continue;
    next++;
    const id = next;
    const c = {
      maxV: -1,
      mx: 0,
      my: 0,
      minx: 1e9,
      miny: 1e9,
      maxx: -1,
      maxy: -1,
      count: 0,
    };
    stack.length = 0;
    stack.push(i);
    lab[i] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W;
      const y = (p - x) / W;
      const dv = Math.sqrt(distSq[p]);
      if (dv > c.maxV) {
        c.maxV = dv;
        c.mx = x;
        c.my = y;
      }
      if (x < c.minx) c.minx = x;
      if (x > c.maxx) c.maxx = x;
      if (y < c.miny) c.miny = y;
      if (y > c.maxy) c.maxy = y;
      c.count++;
      if (x > 0 && ink[p - 1] && !lab[p - 1]) {
        lab[p - 1] = id;
        stack.push(p - 1);
      }
      if (x < W - 1 && ink[p + 1] && !lab[p + 1]) {
        lab[p + 1] = id;
        stack.push(p + 1);
      }
      if (y > 0 && ink[p - W] && !lab[p - W]) {
        lab[p - W] = id;
        stack.push(p - W);
      }
      if (y < H - 1 && ink[p + W] && !lab[p + W]) {
        lab[p + W] = id;
        stack.push(p + W);
      }
    }
    comps[id] = c;
  }
  return { lab, comps };
}
