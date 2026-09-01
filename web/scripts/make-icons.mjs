// Generates the PWA icons (PNG) without any image library.
// Raw RGBA -> zlib deflate -> minimal PNG. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [13, 17, 23]
const GREEN = [63, 185, 80]
const DIM = [48, 54, 61]

function canvas(size, bg) {
  const px = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255
  }
  return { size, px }
}

function blend(c, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size || alpha <= 0) return
  const i = (y * c.size + x) * 4
  const a = Math.min(1, alpha)
  for (let k = 0; k < 3; k++) c.px[i + k] = Math.round(c.px[i + k] * (1 - a) + color[k] * a)
}

// anti-aliased thick segment via distance field (4x supersample)
function segment(c, x0, y0, x1, y1, w, color) {
  const r = w / 2
  const minX = Math.floor(Math.min(x0, x1) - r - 2), maxX = Math.ceil(Math.max(x0, x1) + r + 2)
  const minY = Math.floor(Math.min(y0, y1) - r - 2), maxY = Math.ceil(Math.max(y0, y1) + r + 2)
  const dx = x1 - x0, dy = y1 - y0
  const len2 = dx * dx + dy * dy || 1
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let hits = 0
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4
          let t = ((px - x0) * dx + (py - y0) * dy) / len2
          t = Math.max(0, Math.min(1, t))
          const cx = x0 + t * dx, cy = y0 + t * dy
          if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) hits++
        }
      }
      if (hits) blend(c, x, y, color, hits / 16)
    }
  }
}

function png(c) {
  const { size, px } = c
  const stride = size * 4
  const raw = new Uint8Array((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(px.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const idat = deflateSync(Buffer.from(raw), { level: 9 })
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let cc = n
    for (let k = 0; k < 8; k++) cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1
    crcTable[n] = cc >>> 0
  }
  const crc = (buf) => {
    let cc = 0xffffffff
    for (const b of buf) cc = crcTable[(cc ^ b) & 0xff] ^ (cc >>> 8)
    return (cc ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const c32 = Buffer.alloc(4); c32.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, c32])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ])
}

// The mark: a rising line chart with an arrowhead, on dark ground.
function draw(size, inset) {
  const c = canvas(size, BG)
  const u = size / 100
  const m = inset * size // safe-area inset for maskable
  const s = (n) => m + (n / 100) * (size - 2 * m)
  const w = 9 * u * (1 - 2 * inset)
  // baseline
  segment(c, s(14), s(82), s(86), s(82), w * 0.55, DIM)
  // rising polyline
  const pts = [[16, 72], [37, 55], [52, 63], [84, 26]]
  for (let i = 0; i < pts.length - 1; i++) {
    segment(c, s(pts[i][0]), s(pts[i][1]), s(pts[i + 1][0]), s(pts[i + 1][1]), w, GREEN)
  }
  // arrowhead
  segment(c, s(84), s(26), s(63), s(26), w, GREEN)
  segment(c, s(84), s(26), s(84), s(47), w, GREEN)
  return c
}

writeFileSync(join(OUT, 'icon-192.png'), png(draw(192, 0.02)))
writeFileSync(join(OUT, 'icon-512.png'), png(draw(512, 0.02)))
writeFileSync(join(OUT, 'icon-512-maskable.png'), png(draw(512, 0.12)))
writeFileSync(join(OUT, 'apple-touch-icon.png'), png(draw(180, 0.04)))
console.log('icons written to public/')
