import { memo, useCallback, useEffect, useRef, useState } from 'react'

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

let fontsLinked = false
let fontsReadyPromise = null
function linkGoogleFonts() {
  if (fontsLinked) return fontsReadyPromise || Promise.resolve()
  fontsLinked = true
  const fams = FONTS.filter((font) => font.g)
    .map((font) => 'family=' + font.g.replace(/ /g, '+'))
    .join('&')
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${fams}&display=swap`
  document.head.appendChild(link)

  fontsReadyPromise = new Promise((resolve) => {
    const fallback = window.setTimeout(resolve, 2500)
    const done = () => {
      window.clearTimeout(fallback)
      resolve()
    }
    if ('fonts' in document) {
      document.fonts.ready.then(done, done)
    } else {
      link.addEventListener('load', done, { once: true })
      link.addEventListener('error', done, { once: true })
    }
  })
  return fontsReadyPromise
}

async function ensureFont(font, px, sample) {
  try {
    await document.fonts.load(fontSpec(font, px), sample || 'A')
  } catch {
    // ignore font load issues; the canvas will still render with a fallback
  }
  if ('fonts' in document) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => window.setTimeout(resolve, 2500)),
      ])
    } catch {
      // ignore font readiness issues; the canvas will still render with a fallback
    }
  }
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

function fillInterior(mods, dist, W, H, pitch, clearance, L, Wd) {
  const setback = clearance + Wd / 2
  const edgeMarginPx = Math.max(1, clearance * 0.35)
  const fillStep = Math.max(Wd + clearance, Math.min(pitch, L) * 0.85)
  const cell = Math.max(6, fillStep * 0.72)
  const grid = new Map()

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
    return (
      d00 * (1 - fx) * (1 - fy) +
      d10 * fx * (1 - fy) +
      d01 * (1 - fx) * fy +
      d11 * fx * fy
    )
  }

  const near = (x, y) => {
    const gx = Math.floor(x / cell)
    const gy = Math.floor(y / cell)
    const r2 = (fillStep * 0.58) * (fillStep * 0.58)
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = grid.get(`${gx + a}_${gy + b}`)
        if (!arr) continue
        for (const m of arr) {
          if ((m[0] - x) ** 2 + (m[1] - y) ** 2 < r2) return true
        }
      }
    }
    return false
  }

  const add = (x, y, ang) => {
    if (near(x, y)) return false
    const k = `${Math.floor(x / cell)}_${Math.floor(y / cell)}`
    let arr = grid.get(k)
    if (!arr) {
      arr = []
      grid.set(k, arr)
    }
    arr.push([x, y])
    mods.push({ x, y, ang })
    return true
  }

  const footprintScore = (mx, my, ang) => {
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    const hl = L / 2
    const hw = Wd / 2
    const probes = [
      [hl, hw],
      [hl, -hw],
      [-hl, hw],
      [-hl, -hw],
      [hl, 0],
      [-hl, 0],
      [0, hw],
      [0, -hw],
    ]
    let minD = Infinity
    for (const [a, b] of probes) {
      const X = mx + c * a - s * b
      const Y = my + s * a + c * b
      const d = sd(X, Y)
      if (d < minD) minD = d
      if (minD < edgeMarginPx) return minD
    }
    return minD
  }

  const candidateAngles = (x, y) => {
    const gx = sd(x + 1, y) - sd(x - 1, y)
    const gy = sd(x, y + 1) - sd(x, y - 1)
    const mag = Math.hypot(gx, gy)
    const base = mag > 0.001 ? Math.atan2(gy, gx) + Math.PI / 2 : 0
    return [base, base + Math.PI / 2, 0, Math.PI / 2]
  }

  for (let pass = 0; pass < 2; pass++) {
    const yShift = pass ? fillStep * 0.5 : 0
    for (let y = yShift + fillStep * 0.5; y < H - fillStep * 0.5; y += fillStep) {
      const xOffset = pass ? fillStep * 0.5 : 0
      for (let x = xOffset + fillStep * 0.5; x < W - fillStep * 0.5; x += fillStep) {
        if (sd(x, y) < setback) continue
        if (near(x, y)) continue
        let bestAng = 0
        let bestScore = -Infinity
        for (const ang of candidateAngles(x, y)) {
          const score = footprintScore(x, y, ang)
          if (score > bestScore) {
            bestScore = score
            bestAng = ang
          }
        }
        if (bestScore >= edgeMarginPx) add(x, y, bestAng)
      }
    }
  }

  return mods
}

function measureLetterBounds(ctx, text) {
  const chars = Array.from(text)
  const advances = measureLetterAdvances(ctx, text)
  return chars.map((char, i) => ({
    char,
    left: advances[i],
    right: advances[i + 1],
    width: Math.max(0, advances[i + 1] - advances[i]),
  }))
}

function measureLetterAdvances(ctx, text) {
  const chars = Array.from(text)
  const advances = [0]
  for (let i = 1; i <= chars.length; i++) {
    advances[i] = ctx.measureText(chars.slice(0, i).join('')).width
  }
  return advances
}

function buildLetterLocalModules({ ctx, font, px, H, baseY, char, pad, mode, spacing, clearance, mlen }) {
  const charWidth = Math.max(1, Math.ceil(ctx.measureText(char).width))
  const W = charWidth + pad * 2
  const localX0 = pad
  const mask = document.createElement('canvas')
  mask.width = W
  mask.height = H
  const mctx = mask.getContext('2d', { willReadFrequently: true })
  if (!mctx) return { localMods: [], over: 0 }

  mctx.clearRect(0, 0, W, H)
  mctx.font = fontSpec(font, px)
  mctx.textBaseline = 'alphabetic'
  mctx.fillStyle = '#fff'
  mctx.fillText(char, localX0, baseY)

  const data = mctx.getImageData(0, 0, W, H).data
  const ink = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) ink[i] = data[i * 4 + 3] > 128 ? 1 : 0

  const dist = distTransform(ink, W, H)
  const skel = thin(ink, W, H)
  const branches = stitchBranches(traceSkeleton(skel, W, H), 0.5)

  const L = mlen
  const Wd = 10
  const setback = clearance + Wd / 2
  const mods = placeRuns(branches, dist, W, H, spacing, clearance, Wd, mode === 'single', mlen)
  if (mode === 'fill') {
    fillInterior(mods, dist, W, H, spacing, clearance, mlen, Wd)
  }

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

  const spacingGap = Math.max(4, clearance * 0.7, spacing * 0.22)
  const spacedMods = filterPlacements(mods, L, Wd, spacingGap)
  const sdist = (x, y) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
    return dist[yi * W + xi]
  }
  let over = 0
  const localMods = spacedMods.map((mm) => {
    const isOut = moduleOut(mm, L, Wd, sdist)
    if (isOut) over++
    return { x: mm.x, y: mm.y, ang: mm.ang, overhang: isOut }
  })

  return { localMods, over }
}

const letterLocalCache = new Map()
function getLetterLocalModules(options) {
  const key = [
    options.char,
    options.font.css || options.font.plain,
    options.px,
    options.H,
    options.baseY,
    options.pad,
    options.mode,
    options.spacing,
    options.clearance,
    options.mlen,
  ].join('|')
  if (letterLocalCache.has(key)) return letterLocalCache.get(key)

  const result = buildLetterLocalModules(options)
  letterLocalCache.set(key, result)
  if (letterLocalCache.size > 96) {
    const firstKey = letterLocalCache.keys().next().value
    letterLocalCache.delete(firstKey)
  }
  return result
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

function filterPlacements(mods, L, Wd, gapPx) {
  const kept = []
  const grid = new Map()
  const pad = Math.max(0, gapPx)
  const radius = Math.hypot(L / 2 + pad / 2, Wd / 2 + pad / 2)
  const radius2 = radius * radius
  const cell = Math.max(8, radius * 1.15)
  for (const m of mods) {
    const gx = Math.floor(m.x / cell)
    const gy = Math.floor(m.y / cell)
    let collide = false
    for (let a = -1; a <= 1 && !collide; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = grid.get(`${gx + a}_${gy + b}`)
        if (!arr) continue
        for (const p of arr) {
          const dx = p.x - m.x
          const dy = p.y - m.y
          if (dx * dx + dy * dy < radius2) {
            collide = true
            break
          }
        }
        if (collide) break
      }
    }
    if (!collide) {
      kept.push(m)
      let arr = grid.get(`${gx}_${gy}`)
      if (!arr) {
        arr = []
        grid.set(`${gx}_${gy}`, arr)
      }
      arr.push(m)
    }
  }
  return kept
}

function buildWireChains(mods, maxJump) {
  if (mods.length < 2) return []
  const maxJump2 = maxJump * maxJump
  const order = mods
    .map((m, i) => i)
    .sort((a, b) => mods[a].x - mods[b].x || mods[a].y - mods[b].y)
  const used = new Set()
  const chains = []

  while (used.size < mods.length) {
    let start = -1
    for (const idx of order) {
      if (!used.has(idx)) {
        start = idx
        break
      }
    }
    if (start === -1) break

    const chain = [start]
    used.add(start)

    while (true) {
      const last = mods[chain[chain.length - 1]]
      let bestIdx = -1
      let bestD2 = Infinity
      for (let i = 0; i < mods.length; i++) {
        if (used.has(i)) continue
        const dx = mods[i].x - last.x
        const dy = mods[i].y - last.y
        const d2 = dx * dx + dy * dy
        if (d2 > maxJump2 || d2 >= bestD2) continue
        bestD2 = d2
        bestIdx = i
      }
      if (bestIdx === -1) break
      used.add(bestIdx)
      chain.push(bestIdx)
    }

    if (chain.length >= 2) chains.push(chain.map((idx) => mods[idx]))
  }

  return chains
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

const Slider = memo(function Slider({ label, value, min, max, unit, onChange }) {
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
})

export default function App() {
  const viewRef = useRef(null)
  const maskRef = useRef(null)
  const renderSeqRef = useRef(0)

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
  const [generating, setGenerating] = useState(false)

  const render = useCallback(async (requestSeq, params) => {
    const view = viewRef.current
    if (!view) return
    const vctx = view.getContext('2d')
    if (!vctx) return
    if (!maskRef.current) maskRef.current = document.createElement('canvas')
    const mask = maskRef.current
    const mctx = mask.getContext('2d', { willReadFrequently: true })
    if (!mctx) return
    const isStale = () => requestSeq !== renderSeqRef.current
    const pause = () => new Promise((resolve) => {
      const done = () => window.requestAnimationFrame(resolve)
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(done, { timeout: 80 })
      } else {
        done()
      }
    })
    const { text, fontIdx, mode, spacing, clearance, mlen } = params

    const font = FONTS[fontIdx]
    if (!text.trim()) {
      if (isStale()) return
      vctx.clearRect(0, 0, view.width, view.height)
      setCount(0)
      setBoard('0 x 0')
      setOver(0)
      setLetterCounts([])
      return
    }

    let px = Math.max(150, Math.min(200, 225 - text.length * 4))
    const pad = 52
    await linkGoogleFonts()
    await ensureFont(font, px, text)
    if (isStale()) return
    await pause()
    if (isStale()) return
    mctx.font = fontSpec(font, px)
    mctx.textBaseline = 'alphabetic'
    let m = mctx.measureText(text)
    let tw = Math.ceil(m.width)
    if (tw + 2 * pad > 1500) {
      px = Math.floor((px * 1500) / (tw + 2 * pad))
      await ensureFont(font, px, text)
      await linkGoogleFonts()
      if (isStale()) return
      await pause()
      if (isStale()) return
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

    const advances = measureLetterAdvances(mctx, text)
    const chars = Array.from(text)
    const spacedMods = []
    const letterModuleCounts = []
    const localModulesByChar = new Map()
    let overCount = 0

    for (const char of new Set(chars)) {
      localModulesByChar.set(char, getLetterLocalModules({
        ctx: mctx,
        font,
        px,
        H,
        baseY,
        char,
        pad,
        mode,
        spacing,
        clearance,
        mlen,
      }))
    }

    for (let i = 0; i < chars.length; i++) {
      const offset = x0 + advances[i] - pad
      const { localMods, over } = localModulesByChar.get(chars[i])
      for (const lm of localMods) {
        spacedMods.push({ x: lm.x + offset, y: lm.y, ang: lm.ang, overhang: lm.overhang })
      }
      letterModuleCounts.push(localMods.length)
      overCount += over
      if (i % 2 === 1) {
        await pause()
        if (isStale()) return
      }
    }

    const L = mlen
    const Wd = 10
    const dot = Math.max(1.6, Math.min(2.7, Wd * 0.3))
    const spacingGap = Math.max(4, clearance * 0.7, spacing * 0.22)
    const wireChains = buildWireChains(spacedMods, Math.max(spacingGap * 2.8, mlen * 1.2))
    await pause()
    if (isStale()) return

    const leftMargin = Math.max(72, Math.round(H * 0.15))
    const canvasW = W + leftMargin
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelW = Math.ceil(canvasW * dpr)
    const pixelH = Math.ceil(H * dpr)
    if (view.width !== pixelW || view.height !== pixelH) {
      view.width = pixelW
      view.height = pixelH
    }
    view.style.width = '100%'
    view.style.height = 'auto'
    view.style.aspectRatio = `${canvasW} / ${H}`
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    vctx.clearRect(0, 0, canvasW, H)
    if (isStale()) return

    // Height dimension gutter.
    const dimX = Math.max(24, leftMargin * 0.35)
    const dimTop = 18
    const dimBot = H - 18
    vctx.save()
    vctx.strokeStyle = 'rgba(217, 223, 232, 0.6)'
    vctx.fillStyle = 'rgba(217, 223, 232, 0.9)'
    vctx.lineWidth = 1.2
    vctx.beginPath()
    vctx.moveTo(dimX, dimTop)
    vctx.lineTo(dimX, dimBot)
    vctx.stroke()
    vctx.beginPath()
    vctx.moveTo(dimX - 6, dimTop + 8)
    vctx.lineTo(dimX, dimTop)
    vctx.lineTo(dimX + 6, dimTop + 8)
    vctx.moveTo(dimX - 6, dimBot - 8)
    vctx.lineTo(dimX, dimBot)
    vctx.lineTo(dimX + 6, dimBot - 8)
    vctx.stroke()
    vctx.translate(dimX - 8, H / 2)
    vctx.rotate(-Math.PI / 2)
    vctx.font = '600 14px Arial, sans-serif'
    vctx.textAlign = 'center'
    vctx.textBaseline = 'middle'
    vctx.fillText(`${Math.round(H)} px`, 0, 0)
    vctx.restore()

    vctx.save()
    vctx.translate(leftMargin, 0)

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

    const visualInset = Math.min(2.2, Math.max(0.8, Wd * 0.14))
    const drawL = Math.max(2, L - visualInset * 2)
    const drawWd = Math.max(2, Wd - visualInset * 2)
    const drawDot = Math.max(1, dot * 0.92)

    for (let i = 0; i < spacedMods.length; i++) {
      const mm = spacedMods[i]
      const isOut = !!mm.overhang
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
    for (const mm of spacedMods) {
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

    const wireWidth = Math.max(1.9, spacingGap * 0.18)
    const wireBlend = 0.9
    const drawChainWire = (chain) => {
      if (chain.length < 2) return
      vctx.beginPath()
      vctx.moveTo(chain[0].x, chain[0].y)
      for (let i = 1; i < chain.length; i++) {
        const prev = chain[i - 1]
        const cur = chain[i]
        const dx = cur.x - prev.x
        const dy = cur.y - prev.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const nx = -uy
        const ny = ux
        const bend = Math.max(4, Math.min(14, len * 0.16)) * (i % 2 === 0 ? -1 : 1)
        const sx = prev.x + ux * (drawL * 0.42)
        const sy = prev.y + uy * (drawL * 0.42)
        const ex = cur.x - ux * (drawL * 0.42)
        const ey = cur.y - uy * (drawL * 0.42)
        const cx = (sx + ex) / 2 + nx * bend
        const cy = (sy + ey) / 2 + ny * bend
        vctx.moveTo(sx, sy)
        vctx.quadraticCurveTo(cx, cy, ex, ey)
      }
    }

    vctx.save()
    vctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
    vctx.lineWidth = wireWidth + 2.6
    vctx.lineCap = 'round'
    vctx.lineJoin = 'round'
    for (const chain of wireChains) drawChainWire(chain)
    vctx.stroke()
    vctx.strokeStyle = `rgba(223, 228, 236, ${wireBlend})`
    vctx.lineWidth = wireWidth
    for (const chain of wireChains) drawChainWire(chain)
    vctx.stroke()
    vctx.restore()
    vctx.restore()

    if (isStale()) return
    setCount(spacedMods.length)
    setBoard(`${W} x ${H}`)
    setOver(overCount)
    setLetterCounts(
      letterModuleCounts.map((value, i) => ({
        char: letterBounds[i]?.char ?? '',
        count: value,
        width: letterBounds[i]?.width ?? 0,
      })),
    )
  }, [])

  useEffect(() => {
    linkGoogleFonts()
  }, [])

  useEffect(() => {
    const seq = ++renderSeqRef.current
    void render(seq, { text, fontIdx, mode, spacing, clearance, mlen })
  }, [render, text, fontIdx, mode, spacing, clearance, mlen])

  const handleGenerate = () => {
    setGenerating(true)
    const seq = ++renderSeqRef.current
    void render(seq, { text, fontIdx, mode, spacing, clearance, mlen }).finally(() => setGenerating(false))
  }

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
              <div className="input-row">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  spellCheck={false}
                  placeholder="Type a name or word"
                />
                <button
                  type="button"
                  className="generate-btn"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? '…' : 'Generate'}
                </button>
              </div>
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
