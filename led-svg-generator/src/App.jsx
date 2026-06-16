import { useCallback, useEffect, useRef, useState } from 'react'

const FONTS = [
  { label: 'Anton (display)', css: "'Anton'", g: 'Anton' },
  { label: 'Archivo Black (bold)', css: "'Archivo Black'", g: 'Archivo Black' },
  { label: 'Bebas Neue (tall)', css: "'Bebas Neue'", g: 'Bebas Neue' },
  { label: 'Oswald (condensed)', css: "'Oswald'", g: 'Oswald:wght@600' },
  { label: 'Pacifico (script)', css: "'Pacifico'", g: 'Pacifico' },
  { label: 'Serif bold', css: "800 1em Georgia,'Times New Roman',serif", g: null, plain: "Georgia,'Times New Roman',serif", weight: '800' },
  { label: 'Sans bold', css: '800 1em Arial,Helvetica,sans-serif', g: null, plain: 'Arial,Helvetica,sans-serif', weight: '800' },
  { label: 'Monospace', css: "700 1em 'Courier New',monospace", g: null, plain: "'Courier New',monospace", weight: '700' },
]

const DEFAULT_TEXT = 'mazisi'

function fontSpec(font, px) {
  return font.g ? `${px}px ${font.css}` : `${font.weight || '400'} ${px}px ${font.plain}`
}

async function ensureFont(font, px, sample) {
  try {
    await document.fonts.load(fontSpec(font, px), sample || 'A')
  } catch {
    // ignore font load issues; the canvas will still render with a fallback
  }
  try {
    await document.fonts.ready
  } catch {
    // ignore
  }
}

let fontsLinked = false
function linkGoogleFonts() {
  if (fontsLinked) return
  fontsLinked = true
  const fams = FONTS.filter((font) => font.g)
    .map((font) => 'family=' + font.g.replace(/ /g, '+'))
    .join('&')
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${fams}&display=swap`
  document.head.appendChild(link)
}

function distTransform(ink, w, h) {
  const d = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) d[i] = ink[i] ? 1e9 : 0
  const a = 1
  const b = 1.4142
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (d[i] === 0) continue
      let v = d[i]
      if (x > 0) v = Math.min(v, d[i - 1] + a)
      if (y > 0) v = Math.min(v, d[i - w] + a)
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + b)
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + b)
      d[i] = v
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      let v = d[i]
      if (x < w - 1) v = Math.min(v, d[i + 1] + a)
      if (y < h - 1) v = Math.min(v, d[i + w] + a)
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + b)
      if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + b)
      d[i] = v
    }
  }
  return d
}

function labelComponents(ink, dist, W, H) {
  const lab = new Int32Array(W * H)
  const comps = [null]
  let next = 0
  const stack = []
  for (let i = 0; i < W * H; i++) {
    if (!ink[i] || lab[i]) continue
    next++
    const id = next
    const c = { maxV: -1, mx: 0, my: 0, minx: 1e9, miny: 1e9, maxx: -1, maxy: -1, count: 0 }
    stack.length = 0
    stack.push(i)
    lab[i] = id
    while (stack.length) {
      const p = stack.pop()
      const x = p % W
      const y = (p - x) / W
      const dv = dist[p]
      if (dv > c.maxV) {
        c.maxV = dv
        c.mx = x
        c.my = y
      }
      if (x < c.minx) c.minx = x
      if (x > c.maxx) c.maxx = x
      if (y < c.miny) c.miny = y
      if (y > c.maxy) c.maxy = y
      c.count++
      if (x > 0 && ink[p - 1] && !lab[p - 1]) {
        lab[p - 1] = id
        stack.push(p - 1)
      }
      if (x < W - 1 && ink[p + 1] && !lab[p + 1]) {
        lab[p + 1] = id
        stack.push(p + 1)
      }
      if (y > 0 && ink[p - W] && !lab[p - W]) {
        lab[p - W] = id
        stack.push(p - W)
      }
      if (y < H - 1 && ink[p + W] && !lab[p + W]) {
        lab[p + W] = id
        stack.push(p + W)
      }
    }
    comps[id] = c
  }
  return { lab, comps }
}

function thin(ink, w, h) {
  const img = Uint8Array.from(ink)
  const at = (x, y) => ((x < 1 || y < 1 || x >= w - 1 || y >= h - 1) ? 0 : img[y * w + x])
  const clear = []

  function step(pass) {
    clear.length = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (img[y * w + x] !== 1) continue
        const p2 = at(x, y - 1)
        const p3 = at(x + 1, y - 1)
        const p4 = at(x + 1, y)
        const p5 = at(x + 1, y + 1)
        const p6 = at(x, y + 1)
        const p7 = at(x - 1, y + 1)
        const p8 = at(x - 1, y)
        const p9 = at(x - 1, y - 1)
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
        if (B < 2 || B > 6) continue
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
        let A = 0
        for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) A++
        if (A !== 1) continue
        if (pass === 0) {
          if (p2 * p4 * p6 !== 0) continue
          if (p4 * p6 * p8 !== 0) continue
        } else {
          if (p2 * p4 * p8 !== 0) continue
          if (p2 * p6 * p8 !== 0) continue
        }
        clear.push(y * w + x)
      }
    }
    for (const i of clear) img[i] = 0
    return clear.length > 0
  }

  let it = 0
  while (it++ < 220) {
    const c1 = step(0)
    const c2 = step(1)
    if (!c1 && !c2) break
  }
  return img
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
]

function traceSkeleton(skel, w, h) {
  const at = (x, y) => ((x < 0 || y < 0 || x >= w || y >= h) ? 0 : skel[y * w + x])
  const deg = (x, y) => {
    let d = 0
    for (const [dx, dy] of NB8) if (at(x + dx, y + dy)) d++
    return d
  }
  const isNode = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (skel[y * w + x] && deg(x, y) !== 2) isNode[y * w + x] = 1
    }
  }
  const used = new Set()
  const vis = new Uint8Array(w * h)
  const branches = []
  const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!skel[y * w + x] || !isNode[y * w + x]) continue
      vis[y * w + x] = 1
      for (const [dx, dy] of NB8) {
        const nx = x + dx
        const ny = y + dy
        if (!at(nx, ny)) continue
        if (used.has(ek(y * w + x, ny * w + nx))) continue
        let px = x
        let py = y
        let cx = nx
        let cy = ny
        used.add(ek(py * w + px, cy * w + cx))
        const br = [[x, y], [nx, ny]]
        vis[cy * w + cx] = 1
        let g = 0
        while (!isNode[cy * w + cx] && g++ < w * h) {
          let moved = false
          for (const [ex, ey] of NB8) {
            const ax = cx + ex
            const ay = cy + ey
            if (!at(ax, ay)) continue
            if (ax === px && ay === py) continue
            if (used.has(ek(cy * w + cx, ay * w + ax))) continue
            px = cx
            py = cy
            cx = ax
            cy = ay
            used.add(ek(py * w + px, cy * w + cx))
            br.push([cx, cy])
            vis[cy * w + cx] = 1
            moved = true
            break
          }
          if (!moved) break
        }
        const lp = br[br.length - 1]
        branches.push({ pts: br, dStart: deg(x, y), dEnd: deg(lp[0], lp[1]) })
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!skel[y * w + x] || vis[y * w + x]) continue
      let px = -1
      let py = -1
      let cx = x
      let cy = y
      const br = [[x, y]]
      vis[y * w + x] = 1
      let g = 0
      while (g++ < w * h) {
        let moved = false
        for (const [ex, ey] of NB8) {
          const ax = cx + ex
          const ay = cy + ey
          if (!at(ax, ay)) continue
          if (ax === px && ay === py) continue
          if (vis[ay * w + ax]) continue
          px = cx
          py = cy
          cx = ax
          cy = ay
          vis[cy * w + cx] = 1
          br.push([cx, cy])
          moved = true
          break
        }
        if (!moved) break
      }
      if (br.length >= 3) branches.push({ pts: br, dStart: 2, dEnd: 2 })
    }
  }
  return branches
}

function stitchBranches(branches, tol) {
  const B = branches.map((b) => ({
    pts: b.pts.map((p) => [p[0], p[1]]),
    dStart: b.dStart,
    dEnd: b.dEnd,
  }))
  const key = (p) => `${Math.round(p[0] / 2)}_${Math.round(p[1] / 2)}`
  const dirAt = (pts, start) => {
    const n = pts.length
    const k = Math.min(6, n - 1)
    const a = start ? pts[0] : pts[n - 1]
    const b = start ? pts[k] : pts[n - 1 - k]
    return Math.atan2(b[1] - a[1], b[0] - a[0])
  }
  const angDiff = (a, b) => {
    let d = Math.abs(a - b) % (2 * Math.PI)
    if (d > Math.PI) d = 2 * Math.PI - d
    return d
  }
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < B.length && !merged; i++) {
      for (let j = i + 1; j < B.length && !merged; j++) {
        const bi = B[i]
        const bj = B[j]
        for (const si of [true, false]) {
          const pi = si ? bi.pts[0] : bi.pts[bi.pts.length - 1]
          for (const sj of [true, false]) {
            const pj = sj ? bj.pts[0] : bj.pts[bj.pts.length - 1]
            if (key(pi) !== key(pj)) continue
            const di = dirAt(bi.pts, si)
            const dj = dirAt(bj.pts, sj)
            if (angDiff(di, dj + Math.PI) < tol) {
              const pip = si ? bi.pts.slice().reverse() : bi.pts.slice()
              const pjp = sj ? bj.pts.slice() : bj.pts.slice().reverse()
              const np = pip.concat(pjp.slice(1))
              B.splice(j, 1)
              B.splice(i, 1, { pts: np, dStart: si ? bi.dEnd : bi.dStart, dEnd: sj ? bj.dEnd : bj.dStart })
              merged = true
              break
            }
          }
          if (merged) break
        }
      }
    }
  }
  return B
}

function smoothOpen(poly, iter) {
  if (poly.length < 3) return poly.map((q) => [q[0], q[1]])
  let p = poly.map((q) => [q[0], q[1]])
  for (let it = 0; it < iter; it++) {
    const o = p.map((q) => [q[0], q[1]])
    for (let i = 1; i < p.length - 1; i++) {
      o[i] = [
        (p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4,
        (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4,
      ]
    }
    p = o
  }
  return p
}

function splitAtCorners(pts, winPx) {
  const n = pts.length
  if (n < 6) return [pts]
  const cum = [0]
  for (let i = 1; i < n; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  const total = cum[n - 1]
  const win = Math.max(winPx * 0.6, 4)
  if (total < win * 2.5) return [pts]
  const thresh = (45 * Math.PI) / 180
  const idxAtArc = (target) => {
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (cum[m] < target) lo = m + 1
      else hi = m
    }
    return lo
  }
  const turnAt = (i) => {
    if (cum[i] < win || total - cum[i] < win) return 0
    const ai = idxAtArc(cum[i] - win)
    const bi = idxAtArc(cum[i] + win)
    if (ai >= i || bi <= i) return 0
    const inA = Math.atan2(pts[i][1] - pts[ai][1], pts[i][0] - pts[ai][0])
    const outA = Math.atan2(pts[bi][1] - pts[i][1], pts[bi][0] - pts[i][0])
    let d = Math.abs(outA - inA)
    if (d > Math.PI) d = 2 * Math.PI - d
    return d
  }

  const corners = []
  let i = 0
  while (i < n) {
    if (turnAt(i) < thresh) {
      i++
      continue
    }
    let j = i
    let bestIdx = i
    let bestT = turnAt(i)
    while (j < n && turnAt(j) >= thresh) {
      const t = turnAt(j)
      if (t > bestT) {
        bestT = t
        bestIdx = j
      }
      j++
    }
    corners.push(bestIdx)
    i = j
  }
  if (corners.length === 0) return [pts]
  const segs = []
  let start = 0
  for (const c of corners) {
    if (c - start + 1 >= 3) segs.push(pts.slice(start, c + 1))
    start = c
  }
  if (n - start >= 3) segs.push(pts.slice(start))
  return segs.length ? segs : [pts]
}

function placeRuns(branches, dist, W, H, pitch, clearance, Wd, single, mlen) {
  const spc = Math.max(pitch, mlen + pitch * 0.2)
  const setback = clearance + Wd / 2
  const edgeMarginPx = Math.max(1, clearance * 0.4)
  const sd = (x, y) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) {
      const xi = Math.round(x)
      const yi = Math.round(y)
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
      return dist[yi * W + xi]
    }
    const fx = x - x0
    const fy = y - y0
    const d00 = dist[y0 * W + x0]
    const d10 = dist[y0 * W + x0 + 1]
    const d01 = dist[(y0 + 1) * W + x0]
    const d11 = dist[(y0 + 1) * W + x0 + 1]
    return d00 * (1 - fx) * (1 - fy) + d10 * fx * (1 - fy) + d01 * (1 - fx) * fy + d11 * fx * fy
  }

  const mods = []
  const cell = pitch * 0.7
  const grid = new Map()
  const near = (x, y) => {
    const gx = Math.floor(x / cell)
    const gy = Math.floor(y / cell)
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = grid.get(`${gx + a}_${gy + b}`)
        if (!arr) continue
        for (const m of arr) {
          if ((m[0] - x) ** 2 + (m[1] - y) ** 2 < (pitch * 0.6) ** 2) return true
        }
      }
    }
    return false
  }
  const add = (x, y, ang) => {
    if (near(x, y)) return
    const k = `${Math.floor(x / cell)}_${Math.floor(y / cell)}`
    let arr = grid.get(k)
    if (!arr) {
      arr = []
      grid.set(k, arr)
    }
    arr.push([x, y])
    mods.push({ x, y, ang })
  }

  const footprintInside = (mx, my, ang) => {
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    const hl = mlen / 2
    const hw = Wd / 2
    const corners = [
      [hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw],
      [hl, 0], [-hl, 0], [0, hw], [0, -hw],
    ]
    for (const [a, b] of corners) {
      const X = mx + c * a - s * b
      const Y = my + s * a + c * b
      if (sd(X, Y) < edgeMarginPx) return false
    }
    return true
  }

  for (const B of branches) {
    const isSpur = (B.dStart >= 3) !== (B.dEnd >= 3)
    let blen = 0
    for (let i = 0; i < B.pts.length - 1; i++) {
      blen += Math.hypot(B.pts[i + 1][0] - B.pts[i][0], B.pts[i + 1][1] - B.pts[i][1])
    }
    if (isSpur && blen < mlen * 1.8) continue

    const smoothed = smoothOpen(B.pts, 6)
    const segments = splitAtCorners(smoothed, mlen)

    for (let si = 0; si < segments.length; si++) {
      const br = segments[si]
      if (br.length < 2) continue

      let total = 0
      for (let i = 0; i < br.length - 1; i++) {
        total += Math.hypot(br[i + 1][0] - br[i][0], br[i + 1][1] - br[i][1])
      }
      if (total < Math.max(pitch * 0.8, mlen * 1.1)) continue

      const chordAng = Math.atan2(br[br.length - 1][1] - br[0][1], br[br.length - 1][0] - br[0][0])
      let maxDev = 0
      for (let i = 0; i < br.length - 1; i++) {
        const segAng = Math.atan2(br[i + 1][1] - br[i][1], br[i + 1][0] - br[i][0])
        let d = segAng - chordAng
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        if (Math.abs(d) > maxDev) maxDev = Math.abs(d)
      }
      const straight = maxDev < (14 * Math.PI) / 180

      const ws = br.map((p) => 2 * sd(p[0], p[1])).sort((a, b) => a - b)
      const medW = ws[Math.floor(ws.length / 2)] || 0
      const acrossPitch = Wd + clearance
      let R = single ? 1 : Math.max(1, Math.floor((medW - 2 * setback) / acrossPitch) + 1)
      R = Math.min(R, 6)
      const runPitch = R > 1 ? acrossPitch : 0

      const startIsJunction = si === 0 && B.dStart >= 3
      const endIsJunction = si === segments.length - 1 && B.dEnd >= 3
      const tS = startIsJunction ? mlen * 0.25 : clearance + mlen / 2
      const tE = endIsJunction ? mlen * 0.25 : clearance + mlen / 2
      const startS = Math.min(tS, total * 0.4)
      const endS = total - Math.min(tE, total * 0.4)

      const sts = []
      let acc = 0
      let station = startS
      for (let i = 0; i < br.length - 1 && station <= endS; i++) {
        const a = br[i]
        const b = br[i + 1]
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const L = Math.hypot(dx, dy)
        if (L === 0) continue
        const ux = dx / L
        const uy = dy / L
        while (station <= acc + L && station <= endS) {
          const dd = station - acc
          sts.push({ x: a[0] + ux * dd, y: a[1] + uy * dd, tx: ux, ty: uy })
          station += spc
        }
        acc += L
      }

      const centreK = (R - 1) / 2
      const scan = Math.max(medW * 0.6, Wd)
      for (const s of sts) {
        const ang = straight ? chordAng : Math.atan2(s.ty, s.tx)
        const px = -Math.sin(ang)
        const py = Math.cos(ang)
        let bestT = 0
        let bestD = sd(s.x, s.y)
        for (let t = -scan; t <= scan; t += 1) {
          const d = sd(s.x + px * t, s.y + py * t)
          if (d > bestD) {
            bestD = d
            bestT = t
          }
        }

        const cx = s.x + px * bestT
        const cy = s.y + py * bestT
        for (let k = 0; k < R; k++) {
          const off = (k - centreK) * runPitch
          const mx = cx + px * off
          const my = cy + py * off
          if (footprintInside(mx, my, ang)) add(mx, my, ang)
        }
      }
    }
  }
  return mods
}

function measureLetterBounds(ctx, text) {
  const chars = Array.from(text)
  const advances = [0]
  for (let i = 1; i <= chars.length; i++) {
    advances[i] = ctx.measureText(chars.slice(0, i).join('')).width
  }
  return chars.map((char, i) => ({
    char,
    left: i === 0 ? 0 : (advances[i - 1] + advances[i]) / 2,
    right: i === chars.length - 1 ? advances[chars.length] : (advances[i] + advances[i + 1]) / 2,
    width: Math.max(0, advances[i + 1] - advances[i]),
  }))
}

function countModulesByLetter(mods, bounds, x0) {
  const counts = bounds.map(() => 0)
  if (!bounds.length) return counts
  for (const mod of mods) {
    const x = mod.x - x0
    let idx = -1
    for (let i = 0; i < bounds.length; i++) {
      if (x >= bounds[i].left && x <= bounds[i].right) {
        idx = i
        break
      }
    }
    if (idx === -1) {
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < bounds.length; i++) {
        const mid = (bounds[i].left + bounds[i].right) / 2
        const d = Math.abs(x - mid)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      idx = best
    }
    counts[idx]++
  }
  return counts
}

function moduleOut(mm, L, Wd, sdist) {
  const c = Math.cos(mm.ang)
  const s = Math.sin(mm.ang)
  const hl = L / 2
  const hw = Wd / 2
  const cor = [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]]
  for (const [a, b] of cor) {
    const X = mm.x + c * a - s * b
    const Y = mm.y + s * a + c * b
    if (sdist(X, Y) < 1.5) return true
  }
  return false
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

function Slider({ label, value, min, max, unit, onChange }) {
  return (
    <div className="slider">
      <label className="slider-label">
        {label} <span>{value} {unit}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export default function App() {
  const viewRef = useRef(null)
  const maskRef = useRef(null)

  const [text, setText] = useState(DEFAULT_TEXT)
  const [fontIdx, setFontIdx] = useState(0)
  const [mode, setMode] = useState('fill')
  const [spacing, setSpacing] = useState(28)
  const [clearance, setClearance] = useState(9)
  const [mlen, setMlen] = useState(20)
  const [count, setCount] = useState(0)
  const [board, setBoard] = useState('0 x 0')
  const [over, setOver] = useState(0)
  const [letterCounts, setLetterCounts] = useState([])

  const render = useCallback(async () => {
    const view = viewRef.current
    if (!view) return
    const vctx = view.getContext('2d')
    if (!vctx) return
    if (!maskRef.current) maskRef.current = document.createElement('canvas')
    const mask = maskRef.current
    const mctx = mask.getContext('2d', { willReadFrequently: true })
    if (!mctx) return

    const font = FONTS[fontIdx]
    if (!text.trim()) {
      vctx.clearRect(0, 0, view.width, view.height)
      setCount(0)
      setBoard('0 x 0')
      setOver(0)
      setLetterCounts([])
      return
    }

    let px = 215
    const pad = 52
    await ensureFont(font, px, text)
    mctx.font = fontSpec(font, px)
    mctx.textBaseline = 'alphabetic'
    let m = mctx.measureText(text)
    let tw = Math.ceil(m.width)
    if (tw + 2 * pad > 1700) {
      px = Math.floor((px * 1700) / (tw + 2 * pad))
      await ensureFont(font, px, text)
      mctx.font = fontSpec(font, px)
      m = mctx.measureText(text)
      tw = Math.ceil(m.width)
    }
    const asc = m.actualBoundingBoxAscent || px * 0.75
    const desc = m.actualBoundingBoxDescent || px * 0.25
    const W = tw + 2 * pad
    const H = Math.ceil(asc + desc) + 2 * pad
    const baseY = pad + asc
    const x0 = pad
    const letterBounds = measureLetterBounds(mctx, text)

    mask.width = W
    mask.height = H
    mctx.clearRect(0, 0, W, H)
    mctx.font = fontSpec(font, px)
    mctx.textBaseline = 'alphabetic'
    mctx.fillStyle = '#fff'
    mctx.fillText(text, x0, baseY)

    const data = mctx.getImageData(0, 0, W, H).data
    const ink = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) ink[i] = data[i * 4 + 3] > 128 ? 1 : 0

    const dist = distTransform(ink, W, H)
    const skel = thin(ink, W, H)
    const branches = stitchBranches(traceSkeleton(skel, W, H), 0.5)

    const L = mlen
    const Wd = 10
    const dot = Math.max(1.6, Math.min(2.7, Wd * 0.3))
    const setback = clearance + Wd / 2
    const mods = placeRuns(branches, dist, W, H, spacing, clearance, Wd, mode === 'single', mlen)

    const { lab, comps } = labelComponents(ink, dist, W, H)
    const covered = new Set()
    for (const mm of mods) {
      const xi = Math.round(mm.x)
      const yi = Math.round(mm.y)
      if (xi >= 0 && yi >= 0 && xi < W && yi < H) {
        const id = lab[yi * W + xi]
        if (id) covered.add(id)
      }
    }
    for (let id = 1; id < comps.length; id++) {
      const c = comps[id]
      if (!c || covered.has(id)) continue
      if (c.maxV >= setback * 0.45 && c.count >= 8) {
        const ang = (c.maxx - c.minx) >= (c.maxy - c.miny) ? 0 : Math.PI / 2
        mods.push({ x: c.mx, y: c.my, ang })
      }
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    view.width = W * dpr
    view.height = H * dpr
    view.style.width = '100%'
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    vctx.clearRect(0, 0, W, H)

    vctx.strokeStyle = 'rgba(255,255,255,0.03)'
    vctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) {
      vctx.beginPath()
      vctx.moveTo(gx, 0)
      vctx.lineTo(gx, H)
      vctx.stroke()
    }
    for (let gy = 0; gy < H; gy += 40) {
      vctx.beginPath()
      vctx.moveTo(0, gy)
      vctx.lineTo(W, gy)
      vctx.stroke()
    }

    vctx.font = fontSpec(font, px)
    vctx.textBaseline = 'alphabetic'
    vctx.lineJoin = 'round'
    vctx.strokeStyle = 'rgba(0,0,0,0.55)'
    vctx.lineWidth = 4.5
    vctx.strokeText(text, x0, baseY)
    vctx.strokeStyle = '#cdd8e6'
    vctx.lineWidth = 2.2
    vctx.strokeText(text, x0, baseY)

    const sdist = (x, y) => {
      const xi = Math.round(x)
      const yi = Math.round(y)
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
      return dist[yi * W + xi]
    }

    let overCount = 0
    const visualInset = Math.min(2.2, Math.max(0.8, Wd * 0.14))
    const drawL = Math.max(2, L - visualInset * 2)
    const drawWd = Math.max(2, Wd - visualInset * 2)
    const drawDot = Math.max(1, dot * 0.92)

    for (const mm of mods) {
      const isOut = moduleOut(mm, L, Wd, sdist)
      if (isOut) overCount++
      vctx.save()
      vctx.translate(mm.x, mm.y)
      vctx.rotate(mm.ang)
      vctx.fillStyle = isOut ? 'rgba(245,170,60,0.95)' : 'rgba(245,248,252,0.92)'
      roundRect(vctx, -drawL / 2, -drawWd / 2, drawL, drawWd, Math.min(3, drawWd / 2))
      vctx.fill()
      vctx.restore()
    }

    vctx.save()
    vctx.shadowColor = 'rgba(255,59,48,0.85)'
    vctx.shadowBlur = dot * 2.4
    vctx.fillStyle = '#ff3b30'
    const nLed = Math.max(1, Math.round(L / 9))
    for (const mm of mods) {
      vctx.save()
      vctx.translate(mm.x, mm.y)
      vctx.rotate(mm.ang)
      for (let k = 0; k < nLed; k++) {
        const lx = nLed === 1 ? 0 : (-drawL * 0.3 + (drawL * 0.6 * (k / (nLed - 1))))
        vctx.beginPath()
        vctx.arc(lx, 0, drawDot, 0, 6.2832)
        vctx.fill()
      }
      vctx.restore()
    }
    vctx.restore()

    setCount(mods.length)
    setBoard(`${W} x ${H}`)
    setOver(overCount)
    setLetterCounts(
      countModulesByLetter(mods, letterBounds, x0).map((value, i) => ({
        char: letterBounds[i]?.char ?? '',
        count: value,
        width: letterBounds[i]?.width ?? 0,
      })),
    )
  }, [text, fontIdx, mode, spacing, clearance, mlen])

  useEffect(() => {
    linkGoogleFonts()
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void render()
    }, 140)
    return () => window.clearTimeout(t)
  }, [render])

  return (
    <div className="page-shell">
      <div className="page-inner">
        <header className="hero">
          <div>
            <h1>Placement Lab</h1>
            <p>Type a name, pick a face, and let the modules follow the stroke centreline.</p>
          </div>
        </header>

        <section className="panel control-panel">
          <div className="control-grid">
            <div className="field field-wide">
              <label>NAME / WORD</label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                placeholder="Type a name or word"
              />
            </div>

            <div className="field">
              <label>FONT</label>
              <select value={fontIdx} onChange={(e) => setFontIdx(Number(e.target.value))}>
                {FONTS.map((font, i) => (
                  <option key={font.label} value={i}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>PLACEMENT</label>
              <div className="toggle-group">
                <button
                  type="button"
                  className={mode === 'fill' ? 'active' : ''}
                  onClick={() => setMode('fill')}
                >
                  Fill
                </button>
                <button
                  type="button"
                  className={mode === 'single' ? 'active' : ''}
                  onClick={() => setMode('single')}
                >
                  Single line
                </button>
              </div>
            </div>

            <div className="field field-wide sliders">
              <Slider label="Spacing" value={spacing} min={16} max={48} unit="px" onChange={setSpacing} />
              <Slider label="Edge clearance" value={clearance} min={2} max={22} unit="px" onChange={setClearance} />
              <Slider label="Module length" value={mlen} min={14} max={64} unit="px" onChange={setMlen} />
            </div>
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="preview-shell">
            <canvas ref={viewRef} className="preview-canvas" />
          </div>
          <div className="stats-row">
            <span>
              LEDs <strong>{count}</strong>
            </span>
            <span>
              Board <strong>{board}</strong>
            </span>
            <span>
              Placement <strong>{mode === 'single' ? 'Single line' : 'Fill'}</strong>
            </span>
            <span>
              Overhang <strong className={over > 0 ? 'warn' : ''}>{over}</strong>
            </span>
          </div>
          {letterCounts.length > 0 ? (
            <div className="letter-strip" aria-label="Per-letter LED counts">
              {letterCounts.map((item, index) => (
                <div
                  key={`${item.char}-${index}`}
                  className="letter-chip"
                  style={{ flexGrow: Math.max(1, item.width || 1) }}
                >
                  <span className="letter-glyph">{item.char}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
