/**
 * Scores a model against an orthographic line drawing (for robots with no public CAD):
 * the drawing's silhouette is everything not reachable from the border through light
 * pixels, so white panels enclosed by outlines count as the robot.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { boundsOf, silhouette, writePng } from './geometry.mjs';

/** 8-bit, non-interlaced PNG (gray, RGB, gray+alpha, RGBA) → { w, h, rgba } */
export function readPng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, type = 0, depth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      if (depth !== 8 || data[12] !== 0) throw new Error('Only 8-bit non-interlaced PNGs');
    } else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error(`Unsupported PNG color type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * ch;
    const [r, g, b, al] = ch === 1 ? [px[s], px[s], px[s], 255] : ch === 2 ? [px[s], px[s], px[s], px[s + 1]] : ch === 3 ? [px[s], px[s + 1], px[s + 2], 255] : [px[s], px[s + 1], px[s + 2], px[s + 3]];
    rgba.set([r, g, b, al], i * 4);
  }
  return { w, h, rgba };
}

/** Silhouette of a line drawing on a light or transparent background, cropped to its bounds */
export function drawingMask(file) {
  const { w, h, rgba } = readPng(file);
  const light = (i) => rgba[i * 4 + 3] < 40 || (rgba[i * 4] > 236 && rgba[i * 4 + 1] > 236 && rgba[i * 4 + 2] > 236);
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (bg[i] || !light(i)) continue;
    bg[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!bg[y * w + x]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  const mask = new Uint8Array(cw * chh);
  // Row 0 = bottom, like the model silhouettes
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) mask[y * cw + x] = bg[(y1 - y) * w + (x0 + x)] ? 0 : 1;
  return { w: cw, h: chh, mask };
}

/**
 * Front-view IoU between a model (triangle soup, mm, Z up, front −Y) and a front drawing.
 * Both are scaled to the same height, so this measures proportions and shape, not size.
 */
export function scoreAgainstDrawing(tris, drawingFile, rows = 240) {
  const d = drawingMask(drawingFile);
  const b = boundsOf(tris);
  const cell = b.size[2] / rows;
  // Model silhouette on a grid of `rows` rows
  const gw = Math.ceil(b.size[0] / cell) + 1;
  const model = silhouette(tris, 'front', { min: b.min, cell, w: gw, h: rows + 1 });
  // Drawing resampled to the same number of rows
  const scale = d.h / (rows + 1);
  const dw = Math.round(d.w / scale);
  const ref = new Uint8Array(dw * (rows + 1));
  for (let y = 0; y <= rows; y++) for (let x = 0; x < dw; x++) {
    ref[y * dw + x] = d.mask[Math.min(d.h - 1, Math.floor((y + 0.5) * scale)) * d.w + Math.min(d.w - 1, Math.floor((x + 0.5) * scale))];
  }
  // Shared canvas, both centered horizontally on their bounds
  const W = Math.max(gw, dw) + 4;
  const H = rows + 1;
  const place = (src, sw) => {
    const out = new Uint8Array(W * H);
    const off = Math.floor((W - sw) / 2);
    for (let y = 0; y < H; y++) for (let x = 0; x < sw; x++) if (src[y * sw + x]) out[y * W + x + off] = 1;
    return out;
  };
  const r = place(ref, dw), g = place(model, gw);
  let inter = 0, uni = 0;
  for (let i = 0; i < r.length; i++) {
    if (r[i] && g[i]) inter++;
    if (r[i] || g[i]) uni++;
  }
  // Width profile: where the model is too wide or narrow, by height band (tenths of height)
  const bands = [];
  for (let k = 0; k < 10; k++) {
    let rw = 0, gwid = 0;
    for (let y = Math.floor((k * H) / 10); y < Math.floor(((k + 1) * H) / 10); y++) {
      for (let x = 0; x < W; x++) {
        rw += r[y * W + x];
        gwid += g[y * W + x];
      }
    }
    bands.push(+(gwid / Math.max(1, rw)).toFixed(2));
  }
  return { iou: +(inter / uni).toFixed(3), widthRatioByBand: bands, aspect: { model: +(gw / H).toFixed(3), drawing: +(dw / H).toFixed(3) }, view: { w: W, h: H, r, g } };
}

export function writeDrawingOverlay(file, view) {
  const { w, h, r, g } = view;
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const c = r[i] && g[i] ? [235, 235, 235] : r[i] ? [40, 140, 255] : g[i] ? [217, 119, 87] : [18, 18, 21];
    rgb.set(c, i * 3);
  }
  writePng(file, w, h, rgb);
}
