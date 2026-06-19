import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
const FONT_METRIC_SAMPLE = 'MpgyÁáÉéÍíÓóÚúÑñÜü'

const DEFAULT_MODULES = [
  { id: 'nano-20x10', name: 'Nano 2-bulb', lengthMm: 20, widthMm: 10 },
  { id: 'nano-10x10', name: 'Nano square', lengthMm: 10, widthMm: 10 },
  { id: 'nano-20x15', name: 'Nano wide', lengthMm: 20, widthMm: 15 },
  { id: 'nano-30x15', name: 'Nano long', lengthMm: 30, widthMm: 15 },
]

function drawModuleShape(ctx, length, width) {
  const drawL = Math.max(2, length)
  const drawWd = Math.max(2, width)
  const inset = Math.min(2.4, Math.max(0.8, width * 0.14))
  const bulbW = Math.max(3, Math.min(drawL * 0.24, (drawL - inset * 3) / 2))
  const bulbH = Math.max(2.5, drawWd - inset * 2)
  const gap = Math.max(2.5, drawL * 0.16)
  const totalBulbs = bulbW * 2 + gap
  const leftX = -totalBulbs / 2
  const rightX = totalBulbs / 2 - bulbW
  const top = -bulbH / 2
  const terminalLen = Math.max(0.8, Math.min(2.5, drawWd * 0.12, drawWd - bulbH - 0.6))

  ctx.save()
  ctx.fillStyle = 'rgba(248, 250, 252, 0.96)'
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)'
  ctx.lineWidth = Math.max(0.9, Math.min(2, drawWd * 0.08))
  roundRect(ctx, -drawL / 2, -drawWd / 2, drawL, drawWd, Math.min(3, drawWd / 2))
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#DCDCDC'
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)'
  ctx.lineWidth = Math.max(0.7, Math.min(1.6, drawWd * 0.06))
  for (const x of [leftX, rightX]) {
    roundRect(ctx, x, top, bulbW, bulbH, Math.min(2, bulbH / 2))
    ctx.fill()
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(75, 85, 99, 0.75)'
  ctx.lineWidth = Math.max(0.6, Math.min(1.2, drawWd * 0.045))
  ctx.beginPath()
  ctx.moveTo(leftX + bulbW / 2, top + bulbH)
  ctx.lineTo(leftX + bulbW / 2, top + bulbH + terminalLen)
  ctx.moveTo(rightX + bulbW / 2, top + bulbH)
  ctx.lineTo(rightX + bulbW / 2, top + bulbH + terminalLen)
  ctx.stroke()
  ctx.restore()
}

function fontSpec(font, px) {
  return font.g ? `${px}px ${font.css}` : `${font.weight || '400'} ${px}px ${font.plain}`
}

function waitForFontPaint() {
  return new Promise((resolve) => {
    const done = () => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
    if ('requestAnimationFrame' in window) {
      done()
    } else {
      resolve()
    }
  })
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

  const linkReady = new Promise((resolve) => {
    const done = () => resolve()
    link.addEventListener('load', done, { once: true })
    link.addEventListener('error', done, { once: true })
    window.setTimeout(done, 2500)
  })
  const fontReady = 'fonts' in document
    ? document.fonts.ready.catch(() => undefined)
    : Promise.resolve()
  fontsReadyPromise = Promise.all([linkReady, fontReady]).then(waitForFontPaint)
  return fontsReadyPromise
}

async function ensureFont(font, px, sample) {
  const text = sample || FONT_METRIC_SAMPLE
  if (!('fonts' in document)) return

  const spec = fontSpec(font, px)
  try {
    if (!document.fonts.check(spec, text)) {
      await document.fonts.load(spec, text)
    }
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, 2500)),
    ])
    if (!document.fonts.check(spec, text)) {
      await document.fonts.load(spec, FONT_METRIC_SAMPLE)
    }
    await waitForFontPaint()
  } catch {
    // ignore font load issues; the canvas will still render with a fallback
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
  const edgeMarginPx = Math.max(1, clearance * 0.15)
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
  const edgeMarginPx = Math.max(1, clearance * 0.15)
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

function buildLetterLocalModules({ ctx, font, px, char, pad, mode, spacing, clearance, mlen, moduleWidth }) {
  const charWidth = Math.max(1, Math.ceil(ctx.measureText(char).width))
  const W = charWidth + pad * 2
  const localX0 = pad
  const metric = ctx.measureText(FONT_METRIC_SAMPLE)
  const localAsc = metric.actualBoundingBoxAscent || px * 0.75
  const localDesc = metric.actualBoundingBoxDescent || px * 0.25
  const H = Math.ceil(localAsc + localDesc) + 2 * pad
  const baseY = pad + localAsc
  const mask = document.createElement('canvas')
  mask.width = W
  mask.height = H
  const mctx = mask.getContext('2d', { willReadFrequently: true })
  if (!mctx) return { localMods: [], over: 0, baseY }

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
  const Wd = moduleWidth
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
  const localMods = []
  const outThreshold = Math.max(1, clearance * 0.15)
  for (const mm of spacedMods) {
    const isOut = moduleOut(mm, L, Wd, sdist, outThreshold)
    if (isOut) {
      over++
      continue
    }
    localMods.push({ x: mm.x, y: mm.y, ang: mm.ang, overhang: false })
  }

  const minModules = estimateMinimumModules({ width: W, height: H }, mlen)
  if (localMods.length < minModules) {
    topUpLetterModules(localMods, dist, W, H, minModules, L, Wd, clearance, spacing)
  }

  const localWireRuns = buildLocalWireRuns(localMods, branches, spacing, mlen, clearance)

  return { localMods, localWireRuns, over, baseY }
}

const letterLocalCache = new Map()
function getLetterLocalModules(options) {
  const key = [
    options.char,
    options.font.css || options.font.plain,
    options.px,
    options.pad,
    options.mode,
    options.spacing,
    options.clearance,
    options.mlen,
    options.moduleWidth,
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

function moduleOut(mm, L, Wd, sdist, threshold = 1.5) {
  const c = Math.cos(mm.ang)
  const s = Math.sin(mm.ang)
  const hl = L / 2
  const hw = Wd / 2
  const cor = [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]]
  for (const [a, b] of cor) {
    const X = mm.x + c * a - s * b
    const Y = mm.y + s * a + c * b
    if (sdist(X, Y) < threshold) return true
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

function polylineLength(pts) {
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  }
  return total
}

function projectPointToPolyline(pt, poly) {
  let best = null
  let acc = 0
  for (let i = 1; i < poly.length; i++) {
    const ax = poly[i - 1][0]
    const ay = poly[i - 1][1]
    const bx = poly[i][0]
    const by = poly[i][1]
    const dx = bx - ax
    const dy = by - ay
    const segLen2 = dx * dx + dy * dy
    if (segLen2 === 0) continue
    const rawT = ((pt.x - ax) * dx + (pt.y - ay) * dy) / segLen2
    const t = Math.max(0, Math.min(1, rawT))
    const px = ax + dx * t
    const py = ay + dy * t
    const ddx = pt.x - px
    const ddy = pt.y - py
    const dist = Math.hypot(ddx, ddy)
    const segLen = Math.sqrt(segLen2)
    if (!best || dist < best.dist) {
      best = {
        dist,
        station: acc + segLen * t,
        tangent: Math.atan2(dy, dx),
        point: { x: px, y: py },
      }
    }
    acc += segLen
  }
  return best
}

function buildLocalWireRuns(localMods, branches, spacing, mlen, clearance) {
  if (localMods.length < 2 || branches.length === 0) return []

  const guideSegments = []
  for (const branch of branches) {
    const smoothed = smoothOpen(branch.pts, 6)
    const segments = splitAtCorners(smoothed, mlen)
    for (const seg of segments) {
      if (polylineLength(seg) >= Math.max(mlen * 1.1, spacing * 1.2)) {
        guideSegments.push(seg)
      }
    }
  }

  if (guideSegments.length === 0) return []

  const groups = new Map()
  const used = new Set()
  const threshold = Math.max(spacing * 0.95, mlen * 0.75, 10)
  const lanePitch = Math.max(10, 10 + clearance)

  for (let i = 0; i < localMods.length; i++) {
    const mod = localMods[i]
    let best = null

    for (let gi = 0; gi < guideSegments.length; gi++) {
      const proj = projectPointToPolyline(mod, guideSegments[gi])
      if (!proj || proj.dist > threshold) continue

      let delta = Math.abs(mod.ang - proj.tangent) % Math.PI
      if (delta > Math.PI / 2) delta = Math.PI - delta
      const score = proj.dist + delta * spacing * 0.35
      if (!best || score < best.score) {
        best = { gi, station: proj.station, tangent: proj.tangent, point: proj.point, score }
      }
    }

    if (!best) continue
    const nx = -Math.cos(best.tangent)
    const ny = -Math.sin(best.tangent)
    const offset = (mod.x - best.point.x) * nx + (mod.y - best.point.y) * ny
    const lane = Math.round(offset / lanePitch)
    const key = `${best.gi}:${lane}`
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push({ mod, station: best.station })
    used.add(i)
  }

  const runs = Array.from(groups.values())
    .map((group) => group
      .sort((a, b) => a.station - b.station || a.mod.x - b.mod.x)
      .map((entry) => entry.mod))
    .filter((run) => run.length >= 2)

  const leftovers = localMods.filter((_, i) => !used.has(i))
  if (leftovers.length >= 2) {
    runs.push(...buildWireChains(leftovers, Math.max(spacing * 2.8, mlen * 1.2)))
  }

  return runs
}

function segmentLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function orientation(a, b, c) {
  const v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
  if (Math.abs(v) < 1e-6) return 0
  return v > 0 ? 1 : -1
}

function onSegment(a, b, c) {
  return (
    Math.min(a.x, c.x) <= b.x + 1e-6 &&
    b.x <= Math.max(a.x, c.x) + 1e-6 &&
    Math.min(a.y, c.y) <= b.y + 1e-6 &&
    b.y <= Math.max(a.y, c.y) + 1e-6
  )
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(a, c, b)) return true
  if (o2 === 0 && onSegment(a, d, b)) return true
  if (o3 === 0 && onSegment(c, a, d)) return true
  if (o4 === 0 && onSegment(c, b, d)) return true
  return false
}

function untangleChain(mods, chain) {
  const out = chain.slice()
  let changed = true
  let guard = 0

  while (changed && guard++ < 12) {
    changed = false
    for (let i = 0; i < out.length - 3; i++) {
      for (let j = i + 2; j < out.length - 1; j++) {
        const a = mods[out[i]]
        const b = mods[out[i + 1]]
        const c = mods[out[j]]
        const d = mods[out[j + 1]]
        if (!segmentsIntersect(a, b, c, d)) continue
        const current = segmentLength(a, b) + segmentLength(c, d)
        const swapped = segmentLength(a, c) + segmentLength(b, d)
        if (swapped <= current + 0.5) {
          const reversed = out.slice(i + 1, j + 1).reverse()
          out.splice(i + 1, j - i, ...reversed)
          changed = true
        }
      }
    }
  }

  return out
}

function buildWireChains(mods, maxJump) {
  if (mods.length < 2) return []

  const hasJumpLimit = Number.isFinite(maxJump)
  const maxJump2 = hasJumpLimit ? maxJump * maxJump : Infinity
  const turnPenalty = hasJumpLimit ? maxJump * 0.75 : 0
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
    let prevDir = null

    while (used.size < mods.length) {
      const last = mods[chain[chain.length - 1]]
      let bestIdx = -1
      let bestScore = Infinity
      let fallbackIdx = -1
      let fallbackD2 = Infinity
      for (let i = 0; i < mods.length; i++) {
        if (used.has(i)) continue
        const dx = mods[i].x - last.x
        const dy = mods[i].y - last.y
        const d2 = dx * dx + dy * dy
        if (hasJumpLimit && d2 > maxJump2) continue

        const dist = Math.hypot(dx, dy) || 1
        const dir = { x: dx / dist, y: dy / dist }
        let score = dist
        if (prevDir) {
          const dot = Math.max(-1, Math.min(1, prevDir.x * dir.x + prevDir.y * dir.y))
          score += (1 - dot) * turnPenalty
        }
        if (d2 < fallbackD2) {
          fallbackD2 = d2
          fallbackIdx = i
        }
        if (score >= bestScore) continue
        bestScore = score
        bestIdx = i
      }

      const nextIdx = bestIdx !== -1 ? bestIdx : fallbackIdx
      if (nextIdx === -1) break
      used.add(nextIdx)
      const from = mods[chain[chain.length - 1]]
      const to = mods[nextIdx]
      const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1
      prevDir = { x: (to.x - from.x) / dist, y: (to.y - from.y) / dist }
      chain.push(nextIdx)
    }

    const optimized = untangleChain(mods, chain)
    if (optimized.length >= 2) chains.push(optimized.map((idx) => mods[idx]))
  }

  return chains
}

function wireEndpoint(module, toward, len) {
  const c = Math.cos(module.ang)
  const s = Math.sin(module.ang)
  const side = (toward.x * c + toward.y * s) >= 0 ? len / 2 : -len / 2
  const sign = side >= 0 ? 1 : -1
  return {
    x: module.x + c * side,
    y: module.y + s * side,
    tx: c * sign,
    ty: s * sign,
  }
}

function drawWireChain(ctx, chain, drawL) {
  if (chain.length < 2) return

  ctx.beginPath()
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1]
    const cur = chain[i]
    const dx = cur.x - prev.x
    const dy = cur.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    const toward = { x: dx / len, y: dy / len }
    const normal = { x: -toward.y, y: toward.x }
    const start = wireEndpoint(prev, toward, drawL)
    const end = wireEndpoint(cur, toward, drawL)
    const wireLen = Math.hypot(end.x - start.x, end.y - start.y) || 1
    const wave = Math.max(4, Math.min(18, wireLen * 0.42)) * (i % 2 === 0 ? -1 : 1)
    const mid = {
      x: (start.x + end.x) / 2 + normal.x * wave,
      y: (start.y + end.y) / 2 + normal.y * wave,
    }
    const c1 = {
      x: start.x + start.tx * wave,
      y: start.y + start.ty * wave,
    }
    const c2 = {
      x: mid.x - start.tx * wave * 0.35,
      y: mid.y - start.ty * wave * 0.35,
    }
    const c3 = {
      x: mid.x + end.tx * wave * 0.35,
      y: mid.y + end.ty * wave * 0.35,
    }
    const c4 = {
      x: end.x - end.tx * wave,
      y: end.y - end.ty * wave,
    }

    if (i === 1) ctx.moveTo(start.x, start.y)
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, mid.x, mid.y)
    ctx.bezierCurveTo(c3.x, c3.y, c4.x, c4.y, end.x, end.y)
  }
  ctx.stroke()
}

function estimateMinimumModules(bounds, mlen) {
  const span = Math.max(bounds.width, bounds.height)
  return Math.min(4, Math.max(2, Math.round(span / Math.max(mlen * 2.1, 1))))
}

function topUpLetterModules(mods, dist, W, H, targetCount, L, Wd, clearance, spacing) {
  if (mods.length >= targetCount) return mods

  const sd = (x, y) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return 0
    return dist[yi * W + xi]
  }
  const gap = Math.max(4, clearance * 0.65)
  const cell = Math.max(6, Math.min(spacing, L) * 0.65)
  const grid = new Map()
  const addGrid = (m) => {
    const k = `${Math.floor(m.x / cell)}_${Math.floor(m.y / cell)}`
    let arr = grid.get(k)
    if (!arr) {
      arr = []
      grid.set(k, arr)
    }
    arr.push(m)
  }
  for (const m of mods) addGrid(m)

  const near = (x, y) => {
    const gx = Math.floor(x / cell)
    const gy = Math.floor(y / cell)
    const r2 = (Math.max(L, Wd) * 0.6 + gap) ** 2
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = grid.get(`${gx + a}_${gy + b}`)
        if (!arr) continue
        for (const m of arr) {
          const dx = m.x - x
          const dy = m.y - y
          if (dx * dx + dy * dy < r2) return true
        }
      }
    }
    return false
  }

  const footprintInside = (mx, my, ang) => {
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    const hl = L / 2
    const hw = Wd / 2
    const corners = [
      [hl, hw],
      [hl, -hw],
      [-hl, hw],
      [-hl, -hw],
      [hl, 0],
      [-hl, 0],
      [0, hw],
      [0, -hw],
    ]
    for (const [a, b] of corners) {
      const X = mx + c * a - s * b
      const Y = my + s * a + c * b
      if (sd(X, Y) < gap) return false
    }
    return true
  }

  const candidates = []
  const step = Math.max(3, Math.min(spacing, Math.max(L, Wd)) * 0.45)
  for (let y = step; y < H - step; y += step) {
    for (let x = step; x < W - step; x += step) {
      const d = sd(x, y)
      if (d < clearance + Wd / 2) continue
      if (near(x, y)) continue
      const gx = sd(x + 1, y) - sd(x - 1, y)
      const gy = sd(x, y + 1) - sd(x, y - 1)
      const mag = Math.hypot(gx, gy)
      const base = mag > 0.001 ? Math.atan2(gy, gx) + Math.PI / 2 : 0
      candidates.push({
        x,
        y,
        score: d,
        angles: [base, base + Math.PI / 2, 0, Math.PI / 2],
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  for (const cand of candidates) {
    if (mods.length >= targetCount) break
    let best = null
    let bestScore = -Infinity
    for (const ang of cand.angles) {
      if (!footprintInside(cand.x, cand.y, ang)) continue
      const score = sd(cand.x, cand.y)
      if (score > bestScore) {
        bestScore = score
        best = ang
      }
    }
    if (best === null) continue
    const m = { x: cand.x, y: cand.y, ang: best, overhang: false }
    mods.push(m)
    addGrid(m)
  }
  return mods
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
  const modulesRef = useRef([])
  const canvasSizeRef = useRef({ width: 0, height: 0, offsetX: 0, offsetY: 0 })

  const [text, setText] = useState(DEFAULT_TEXT)
  const [fontIdx, setFontIdx] = useState(0)
  const [mode, setMode] = useState('fill')
  const [size, setSize] = useState(100)
  const [depth, setDepth] = useState(100)
  const [spacing, setSpacing] = useState(28)
  const [clearance, setClearance] = useState(9)
  const [selectedModuleId, setSelectedModuleId] = useState(DEFAULT_MODULES[0].id)
  const selectedModule = useMemo(
    () => DEFAULT_MODULES.find((module) => module.id === selectedModuleId) ?? DEFAULT_MODULES[0],
    [selectedModuleId],
  )
  const moduleLengthMm = selectedModule.lengthMm
  const moduleWidthMm = selectedModule.widthMm
  const [count, setCount] = useState(0)
  const [board, setBoard] = useState('0 x 0')
  const [over, setOver] = useState(0)
  const [letterCounts, setLetterCounts] = useState([])
  const [generating, setGenerating] = useState(false)
  const [wireEditMode, setWireEditMode] = useState(false)
  const [activeWireModule, setActiveWireModule] = useState(null)
  const [hoveredModule, setHoveredModule] = useState(null)
  const [manualConnections, setManualConnections] = useState([])

  const connectionKey = (a, b) => {
    const [x, y] = a < b ? [a, b] : [b, a]
    return `${x}:${y}`
  }

  const getCanvasPoint = (event) => {
    const view = viewRef.current
    const { width, height, offsetX, offsetY } = canvasSizeRef.current
    if (!view || width <= 0 || height <= 0) return null
    const rect = view.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (width / rect.width) - offsetX,
      y: (event.clientY - rect.top) * (height / rect.height) - offsetY,
    }
  }

  const findModuleAt = (x, y) => {
    let best = null
    let bestArea = Infinity
    for (const mod of modulesRef.current) {
      const dx = x - mod.x
      const dy = y - mod.y
      const c = Math.cos(-mod.ang)
      const s = Math.sin(-mod.ang)
      const lx = dx * c - dy * s
      const ly = dx * s + dy * c
      const hw = mod.hitWidth / 2
      const hh = mod.hitHeight / 2
      if (lx >= -hw && lx <= hw && ly >= -hh && ly <= hh) {
        const area = Math.abs(lx / hw) + Math.abs(ly / hh)
        if (area < bestArea) {
          bestArea = area
          best = mod.index
        }
      } else if (mod.hitPadding > 0) {
        const phw = hw + mod.hitPadding
        const phh = hh + mod.hitPadding
        if (lx >= -phw && lx <= phw && ly >= -phh && ly <= phh) {
          const area = Math.abs(lx / phw) + Math.abs(ly / phh) + 1
          if (area < bestArea) {
            bestArea = area
            best = mod.index
          }
        }
      }
    }
    return best
  }

  const buildManualWireChains = useCallback(() => {
    if (manualConnections.length === 0) return []
    const byIndex = new Map(modulesRef.current.map((mod) => [mod.index, mod]))
    const chains = []
    for (const [a, b] of manualConnections) {
      const start = byIndex.get(a)
      const end = byIndex.get(b)
      if (!start || !end) continue
      chains.push([start, end])
    }
    return chains
  }, [manualConnections])

  const pruneInvalidManualConnections = (mods) => {
    const valid = new Set(mods.map((mod) => mod.index))
    setManualConnections((prev) => prev.filter(([a, b]) => valid.has(a) && valid.has(b)))
    setActiveWireModule((prev) => (prev !== null && valid.has(prev) ? prev : null))
    setHoveredModule((prev) => (prev !== null && valid.has(prev) ? prev : null))
  }

  const handleCanvasPointerDown = (event) => {
    if (!wireEditMode) return
    const point = getCanvasPoint(event)
    if (!point) return

    const idx = findModuleAt(point.x, point.y)
    if (idx === null) {
      setActiveWireModule(null)
      return
    }

    if (activeWireModule === idx) {
      setActiveWireModule(null)
      return
    }

    if (activeWireModule === null) {
      setActiveWireModule(idx)
      return
    }

    const selected = modulesRef.current.find((mod) => mod.index === activeWireModule)
    const next = modulesRef.current.find((mod) => mod.index === idx)
    if (!selected || !next || selected.letterIndex !== next.letterIndex) {
      setActiveWireModule(idx)
      return
    }

    const key = connectionKey(activeWireModule, idx)
    setManualConnections((prev) => {
      if (prev.some((pair) => connectionKey(pair[0], pair[1]) === key)) {
        return prev.filter((pair) => connectionKey(pair[0], pair[1]) !== key)
      }
      return [...prev, [activeWireModule, idx].sort((a, b) => a - b)]
    })
    setActiveWireModule(null)
  }

  const handleCanvasPointerMove = (event) => {
    if (!wireEditMode) {
      setHoveredModule(null)
      return
    }
    const point = getCanvasPoint(event)
    setHoveredModule(point ? findModuleAt(point.x, point.y) : null)
  }

  const handleCanvasPointerLeave = () => {
    setHoveredModule(null)
  }

  const clearManualConnections = () => {
    setManualConnections([])
    setActiveWireModule(null)
  }

  const undoManualConnection = () => {
    setManualConnections((prev) => prev.slice(0, -1))
    setActiveWireModule(null)
  }

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
    const { text, fontIdx, mode, size, depth, spacing, clearance, mlen, moduleWidthMm } = params

    const font = FONTS[fontIdx]
    if (!text.trim()) {
      if (isStale()) return
      vctx.clearRect(0, 0, view.width, view.height)
      modulesRef.current = []
      canvasSizeRef.current = { width: 0, height: 0, offsetX: 0, offsetY: 0 }
      setCount(0)
      setBoard('0 x 0')
      setOver(0)
      setLetterCounts([])
      return
    }

    const sizeScale = Math.max(0.7, Math.min(1.6, size / 100))
    const depthScale = Math.max(0.7, Math.min(1.6, depth / 100))
    let px = Math.round(Math.max(150, Math.min(200, 225 - text.length * 4)) * sizeScale)
    const pad = Math.round(52 * (0.85 + depthScale * 0.3))
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
    const spacingScaled = Math.max(10, Math.round(spacing * (0.88 + depthScale * 0.12)))
    const clearanceScaled = Math.max(1, clearance * depthScale)

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
    const letterWireGroups = []
    const localModulesByChar = new Map()
    let overCount = 0

    for (const char of new Set(chars)) {
      localModulesByChar.set(char, getLetterLocalModules({
        ctx: mctx,
        font,
        px,
        char,
        pad,
        mode,
        spacing: spacingScaled,
        clearance: clearanceScaled,
        mlen,
        moduleWidth: moduleWidthMm,
      }))
    }

    for (let i = 0; i < chars.length; i++) {
      const offset = x0 + advances[i] - pad
      const { localMods, localWireRuns, over, baseY: localBaseY } = localModulesByChar.get(chars[i])
      const placedMods = []
      for (const lm of localMods) {
        const index = spacedMods.length
        const placed = {
          x: lm.x + offset,
          y: lm.y - localBaseY + baseY,
          ang: lm.ang,
          overhang: lm.overhang,
          index,
          letterIndex: i,
        }
        spacedMods.push(placed)
        placedMods.push(placed)
      }
      const placedByLocalKey = new Map(placedMods.map((mod) => [`${mod.x.toFixed(3)}:${mod.y.toFixed(3)}`, mod]))
      letterWireGroups.push(
        localWireRuns.map((run) =>
          run.map((lm) => placedByLocalKey.get(`${(lm.x + offset).toFixed(3)}:${(lm.y - localBaseY + baseY).toFixed(3)}`) ?? {
            x: lm.x + offset,
            y: lm.y - localBaseY + baseY,
            ang: lm.ang,
            overhang: lm.overhang,
            index: spacedMods.length,
            letterIndex: i,
          }),
        ),
      )
      letterModuleCounts.push(localMods.length)
      overCount += over
      if (i % 2 === 1) {
        await pause()
        if (isStale()) return
      }
    }

    const L = mlen
    const Wd = moduleWidthMm
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
    canvasSizeRef.current = { width: canvasW, height: H, offsetX: leftMargin, offsetY: 0 }
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

    const drawL = L
    const drawWd = Wd
    modulesRef.current = spacedMods.map((mod) => ({
      ...mod,
      hitWidth: drawL,
      hitHeight: drawWd,
      hitPadding: Math.max(2, Math.min(6, mlen * 0.12)),
    }))
    pruneInvalidManualConnections(modulesRef.current)

    const wireWidth = Math.max(0.8, Math.min(drawWd, drawL) * 0.06)
    const wireBlend = 0.9
    const manualWireChains = buildManualWireChains()

    vctx.save()
    vctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
    vctx.lineWidth = wireWidth + 2.6
    vctx.lineCap = 'round'
    vctx.lineJoin = 'round'
    for (const chain of manualWireChains) drawWireChain(vctx, chain, drawL)
    vctx.strokeStyle = `rgba(102, 102, 102, ${wireBlend})`
    vctx.lineWidth = wireWidth
    for (const chain of manualWireChains) drawWireChain(vctx, chain, drawL)
    vctx.restore()

    for (let i = 0; i < modulesRef.current.length; i++) {
      const mm = modulesRef.current[i]
      vctx.save()
      vctx.translate(mm.x, mm.y)
      vctx.rotate(mm.ang)
      vctx.globalAlpha = 1
      drawModuleShape(vctx, drawL, drawWd)
      vctx.restore()

      if (wireEditMode && (activeWireModule === i || hoveredModule === i)) {
        vctx.save()
        vctx.translate(mm.x, mm.y)
        vctx.rotate(mm.ang)
        vctx.strokeStyle = activeWireModule === i ? 'rgba(239, 68, 68, 0.95)' : 'rgba(14, 165, 233, 0.95)'
        vctx.lineWidth = activeWireModule === i ? 2.4 : 1.8
        roundRect(vctx, -drawL / 2, -drawWd / 2, drawL, drawWd, Math.min(3, drawWd / 2))
        vctx.stroke()
        vctx.restore()
      }
    }

    vctx.restore()

    if (isStale()) return
    setCount(modulesRef.current.length)
    setBoard(`${W} x ${H}`)
    setOver(overCount)
    setLetterCounts(
      letterModuleCounts.map((value, i) => ({
        char: letterBounds[i]?.char ?? '',
        count: value,
        width: letterBounds[i]?.width ?? 0,
      })),
    )
  }, [buildManualWireChains, hoveredModule, activeWireModule, wireEditMode])

  useEffect(() => {
    linkGoogleFonts()
  }, [])

  useEffect(() => {
    const seq = ++renderSeqRef.current
    void render(seq, { text, fontIdx, mode, size, depth, spacing, clearance, mlen: moduleLengthMm, moduleWidthMm })
  }, [render, text, fontIdx, mode, size, depth, spacing, clearance, moduleLengthMm, moduleWidthMm])

  const handleGenerate = () => {
    setGenerating(true)
    setManualConnections([])
    setActiveWireModule(null)
    setHoveredModule(null)
    const seq = ++renderSeqRef.current
    void render(seq, { text, fontIdx, mode, size, depth, spacing, clearance, mlen: moduleLengthMm, moduleWidthMm }).finally(() => setGenerating(false))
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

            <div className="field">
              <label>WIRES</label>
              <div className="toggle-group wire-editor-controls">
                <button
                  type="button"
                  className={wireEditMode ? 'active' : ''}
                  onClick={() => setWireEditMode((value) => !value)}
                >
                  {wireEditMode ? 'Editing' : 'Edit wires'}
                </button>
                <button
                  type="button"
                  onClick={undoManualConnection}
                  disabled={manualConnections.length === 0}
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={clearManualConnections}
                  disabled={manualConnections.length === 0}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="field field-wide">
              <label>MODULE</label>
              <select value={selectedModuleId} onChange={(e) => setSelectedModuleId(e.target.value)}>
                {DEFAULT_MODULES.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.name} — {module.lengthMm} x {module.widthMm} mm
                  </option>
                ))}
              </select>
            </div>

            <div className="field field-wide sliders">
              <Slider label="Size" value={size} min={70} max={160} unit="%" onChange={setSize} />
              <Slider label="Depth" value={depth} min={70} max={160} unit="%" onChange={setDepth} />
              <Slider label="Spacing" value={spacing} min={16} max={48} unit="px" onChange={setSpacing} />
              <Slider label="Edge clearance" value={clearance} min={2} max={22} unit="px" onChange={setClearance} />
            </div>
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="preview-shell">
            <canvas
              ref={viewRef}
              className="preview-canvas"
              style={{ cursor: wireEditMode ? 'crosshair' : 'default', touchAction: 'none' }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerLeave={handleCanvasPointerLeave}
              aria-label="LED placement preview"
            />
          </div>
          <div className="stats-row">
            <span>
              LEDs <strong>{count}</strong>
            </span>
            <span>
              Board <strong>{board}</strong>
            </span>
            <span>
              Module <strong>{moduleLengthMm} x {moduleWidthMm} mm</strong>
            </span>
            <span>
              Placement <strong>{mode === 'single' ? 'Single line' : 'Fill'}</strong>
            </span>
            <span>
              Manual wires <strong>{manualConnections.length}</strong>
            </span>
            <span>
              Overhang <strong className={over > 0 ? 'warn' : ''}>{over}</strong>
            </span>
          </div>
          {wireEditMode ? (
            <p className="editor-hint">
              Click one LED, then click another LED in the same letter to create or remove a manual connection.
            </p>
          ) : null}
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
