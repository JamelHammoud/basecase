export interface LabelColor {
  id: string;
  label: number;
  rgb: [number, number, number];
}

export interface GridAxis {
  axis: string;
  sign: number;
  atCenter: number;
}

export interface GridSpec {
  mmPerPx: number;
  stepMm: number;
  horizontal: GridAxis;
  vertical: GridAxis;
}

export interface LabelAnchor {
  label: number;
  x: number;
  y: number;
  pixels: number;
}

const MATCH_DISTANCE = 18;
const MIN_PIXELS = 24;

function nearestColor(colors: LabelColor[], [r, g, b]: [number, number, number]): number {
  let best = -1,
    bestDistance = MATCH_DISTANCE;

  colors.forEach((c, i) => {
    const d = Math.abs(c.rgb[0] - r) + Math.abs(c.rgb[1] - g) + Math.abs(c.rgb[2] - b);

    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });

  return best;
}

function ownerOf(colors: LabelColor[], cache: Map<number, number>, rgb: [number, number, number]): number {
  const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  let k = cache.get(key);

  if (k === undefined) {
    k = nearestColor(colors, rgb);
    cache.set(key, k);
  }

  return k;
}

export function labelAnchors(pixels: Uint8ClampedArray, width: number, colors: LabelColor[]): LabelAnchor[] {
  const owner = new Int32Array(pixels.length / 4);
  const sums = colors.map(() => ({ x: 0, y: 0, n: 0 }));
  const cache = new Map<number, number>();

  for (let i = 0; i < owner.length; i++) {
    const k = ownerOf(colors, cache, [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]]);

    owner[i] = k;

    if (k < 0) continue;

    sums[k].x += i % width;
    sums[k].y += Math.floor(i / width);
    sums[k].n++;
  }

  const centres = sums.map((s) => (s.n ? [s.x / s.n, s.y / s.n] : [0, 0]));
  const best = colors.map(() => ({ x: 0, y: 0, d: Infinity }));

  for (let i = 0; i < owner.length; i++) {
    const k = owner[i];

    if (k < 0) continue;

    const x = i % width,
      y = Math.floor(i / width);
    const d = (x - centres[k][0]) ** 2 + (y - centres[k][1]) ** 2;

    if (d < best[k].d) best[k] = { x, y, d };
  }

  return colors.flatMap((c, k) =>
    sums[k].n < MIN_PIXELS ? [] : [{ label: c.label, pixels: sums[k].n, x: best[k].x, y: best[k].y }],
  );
}

type Context2D = OffscreenCanvasRenderingContext2D;

export function drawLabels(ctx: Context2D, anchors: LabelAnchor[], scale: number): void {
  const size = Math.max(11, Math.round(13 * scale));

  ctx.font = `600 ${size}px -apple-system, "Helvetica Neue", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const a of anchors) {
    const text = String(a.label);
    const w = ctx.measureText(text).width + size * 0.8;
    const h = size * 1.5;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(a.x - w / 2, a.y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, a.x, a.y + 0.5);
  }
}

function gridLines(axis: GridAxis, spec: GridSpec, extentPx: number) {
  const half = (extentPx / 2) * spec.mmPerPx;
  const first = Math.ceil((axis.atCenter - half) / spec.stepMm) * spec.stepMm;
  const lines: Array<{ px: number; mm: number }> = [];

  for (let mm = first; mm <= axis.atCenter + half; mm += spec.stepMm) {
    lines.push({ px: extentPx / 2 + ((mm - axis.atCenter) * axis.sign) / spec.mmPerPx, mm });
  }

  return lines;
}

export function drawGrid(ctx: Context2D, spec: GridSpec, size: { width: number; height: number }): void {
  const fontSize = 11;

  ctx.save();
  ctx.font = `500 ${fontSize}px -apple-system, "Helvetica Neue", sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1;

  for (const { px, mm } of gridLines(spec.horizontal, spec, size.width)) {
    ctx.strokeStyle = mm === 0 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.moveTo(px + 0.5, 0);
    ctx.lineTo(px + 0.5, size.height);
    ctx.stroke();
    ctx.fillText(`${spec.horizontal.axis} ${mm}`, px + 3, size.height - 4);
  }

  for (const line of gridLines(spec.vertical, spec, size.height)) {
    const py = size.height - line.px;

    ctx.strokeStyle = line.mm === 0 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.moveTo(0, py + 0.5);
    ctx.lineTo(size.width, py + 0.5);
    ctx.stroke();
    ctx.fillText(`${spec.vertical.axis} ${line.mm}`, 3, py - 3);
  }

  ctx.restore();
}

export interface LabelJob {
  bitmap: ImageBitmap;
  colors: LabelColor[];
  grid?: GridSpec | null;
  maxSide?: number;
}

export function fitted(width: number, height: number, maxSide?: number) {
  const scale = maxSide ? Math.min(1, maxSide / Math.max(width, height)) : 1;

  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

export async function renderLabelled({ bitmap, colors, grid, maxSide }: LabelJob) {
  const raw = new OffscreenCanvas(bitmap.width, bitmap.height);
  const rawCtx = raw.getContext('2d', { willReadFrequently: true })!;

  rawCtx.drawImage(bitmap, 0, 0);

  const anchors = labelAnchors(rawCtx.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, colors);
  const out = fitted(bitmap.width, bitmap.height, maxSide);
  const canvas = new OffscreenCanvas(out.width, out.height);
  const ctx = canvas.getContext('2d')!;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, out.width, out.height);
  bitmap.close();

  if (grid) drawGrid(ctx, { ...grid, mmPerPx: grid.mmPerPx / out.scale }, out);

  drawLabels(
    ctx,
    anchors.map((a) => ({ ...a, x: a.x * out.scale, y: a.y * out.scale })),
    Math.max(1, out.width / 1024),
  );

  return { blob: await canvas.convertToBlob({ type: 'image/png' }), labels: anchors.map((a) => a.label) };
}
