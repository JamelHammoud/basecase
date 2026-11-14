import type { LaserScan, PointCloud2, PointField, ScenePoints } from './messages';
import { ACCENT, local, paint, pushPoint, rampInto, type Placer, type PointSink } from './pointSink';

export const HEIGHT_FIELD = 'z';
export const RGB_FIELDS = ['rgb', 'rgba'];

const FLOAT32 = 7;

type Reader = (view: DataView, at: number, little: boolean) => number;

const READERS: Record<number, Reader> = {
  1: (v, at) => v.getInt8(at),
  2: (v, at) => v.getUint8(at),
  3: (v, at, le) => v.getInt16(at, le),
  4: (v, at, le) => v.getUint16(at, le),
  5: (v, at, le) => v.getInt32(at, le),
  6: (v, at, le) => v.getUint32(at, le),
  7: (v, at, le) => v.getFloat32(at, le),
  8: (v, at, le) => v.getFloat64(at, le),
};

export const cloudFields = (cloud: Pick<PointCloud2, 'fields'>): string[] =>
  cloud.fields.map((f) => f.name).filter((name) => !['x', 'y', 'z'].includes(name) || name === HEIGHT_FIELD);

export const scanFields = (scan: Pick<LaserScan, 'intensities'>): string[] =>
  scan.intensities?.length ? ['intensity'] : [];

export function laserScanPoints(scan: LaserScan, at: Placer, sink: PointSink, colorBy: string | null) {
  const { ranges, intensities } = scan;
  const shaded = colorBy === 'intensity' && intensities?.length ? intensities : null;
  const top = shaded ? Math.max(1e-9, ...Array.from(shaded)) : 1;

  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];

    if (!(r >= scan.range_min && r <= scan.range_max)) continue;

    const angle = scan.angle_min + i * scan.angle_increment;

    local[0] = r * Math.cos(angle);
    local[1] = r * Math.sin(angle);
    local[2] = 0;

    const k = pushPoint(sink, at);

    if (k < 0) return;

    if (shaded) rampInto(sink.colors, k, shaded[i] / top);
    else paint(sink, k, ACCENT);
  }
}

export function scenePoints(cloud: ScenePoints, sink: PointSink) {
  const room = Math.min(cloud.points.length / 3, sink.positions.length / 3 - sink.count);
  const start = sink.count * 3;

  sink.positions.set(cloud.points.subarray(0, room * 3), start);

  for (let i = 0; i < room; i++) paint(sink, start + i * 3, ACCENT);

  sink.count += room;
}

interface CloudLayout {
  view: DataView;
  little: boolean;
  floats: Float32Array | null;
  xyz: [PointField, PointField, PointField];
}

function cloudLayout(cloud: PointCloud2): CloudLayout | null {
  const field = (name: string) => cloud.fields.find((f) => f.name === name);
  const x = field('x');
  const y = field('y');
  const z = field('z');

  if (!x || !y || !z) return null;

  const little = !cloud.is_bigendian;
  const aligned =
    little &&
    [x, y, z].every((f) => f.datatype === FLOAT32 && f.offset % 4 === 0) &&
    cloud.point_step % 4 === 0 &&
    cloud.data.byteOffset % 4 === 0;
  const view = new DataView(cloud.data.buffer, cloud.data.byteOffset, cloud.data.byteLength);
  const floats = aligned
    ? new Float32Array(cloud.data.buffer, cloud.data.byteOffset, cloud.data.byteLength >> 2)
    : null;

  return { view, little, floats, xyz: [x, y, z] };
}

const isRgb = (f: PointField | undefined) => !!f && RGB_FIELDS.includes(f.name);

function readXyz(layout: CloudLayout, base: number) {
  const { floats, xyz, view, little } = layout;

  if (floats) {
    const w = base >> 2;

    local[0] = floats[w + (xyz[0].offset >> 2)];
    local[1] = floats[w + (xyz[1].offset >> 2)];
    local[2] = floats[w + (xyz[2].offset >> 2)];

    return;
  }

  for (let a = 0; a < 3; a++) local[a] = READERS[xyz[a].datatype](view, base + xyz[a].offset, little);
}

function floatSpan(floats: Float32Array, field: PointField, cloud: PointCloud2) {
  const stride = cloud.point_step >> 2;
  const end = cloud.width * cloud.height * stride;
  let lo = Infinity;
  let hi = -Infinity;

  for (let w = field.offset >> 2; w < end; w += stride) {
    const v = floats[w];

    if (v < lo) lo = v;

    if (v > hi) hi = v;
  }

  return { lo, span: hi > lo ? hi - lo : 1 };
}

function valueSpan(layout: CloudLayout, field: PointField, cloud: PointCloud2) {
  if (layout.floats && field.datatype === FLOAT32 && field.offset % 4 === 0)
    return floatSpan(layout.floats, field, cloud);

  const read = READERS[field.datatype];
  const n = cloud.width * cloud.height;
  let lo = Infinity;
  let hi = -Infinity;

  for (let i = 0; i < n; i++) {
    const v = read(layout.view, i * cloud.point_step + field.offset, layout.little);

    if (v < lo) lo = v;

    if (v > hi) hi = v;
  }

  return { lo, span: hi > lo ? hi - lo : 1 };
}

type Shader = (base: number, k: number) => void;

function shaderFor(layout: CloudLayout, cloud: PointCloud2, colorBy: string | null, sink: PointSink): Shader {
  const shade = cloud.fields.find((f) => f.name === colorBy);
  const { view, little } = layout;

  if (!shade) return (_, k) => paint(sink, k, ACCENT);

  if (isRgb(shade)) {
    return (base, k) => {
      const packed = view.getUint32(base + shade.offset, little);

      sink.colors[k] = (packed >> 16) & 255;
      sink.colors[k + 1] = (packed >> 8) & 255;
      sink.colors[k + 2] = packed & 255;
    };
  }

  const read = READERS[shade.datatype];
  const { lo, span } = valueSpan(layout, shade, cloud);

  return (base, k) => rampInto(sink.colors, k, (read(view, base + shade.offset, little) - lo) / span);
}

const LUT_SIZE = 256;
const LUT = new Uint8Array(LUT_SIZE * 3);

for (let i = 0; i < LUT_SIZE; i++) rampInto(LUT, i * 3, i / (LUT_SIZE - 1));

interface Packed {
  floats: Float32Array;
  words: Uint32Array;
  stride: number;
  x: number;
  y: number;
  z: number;
  shade: number;
  rgb: boolean;
  lo: number;
  scale: number;
}

function packed(cloud: PointCloud2, layout: CloudLayout, colorBy: string | null): Packed | null {
  const shade = cloud.fields.find((f) => f.name === colorBy);
  const rgb = isRgb(shade);

  if (!layout.floats || (shade && !rgb && (shade.datatype !== FLOAT32 || shade.offset % 4))) return null;

  const { lo, span } = shade && !rgb ? valueSpan(layout, shade, cloud) : { lo: 0, span: 1 };
  const { buffer, byteOffset, byteLength } = cloud.data;

  return {
    floats: layout.floats,
    words: new Uint32Array(buffer, byteOffset, byteLength >> 2),
    stride: cloud.point_step >> 2,
    x: layout.xyz[0].offset >> 2,
    y: layout.xyz[1].offset >> 2,
    z: layout.xyz[2].offset >> 2,
    shade: shade ? shade.offset >> 2 : -1,
    rgb,
    lo,
    scale: (LUT_SIZE - 1) / span,
  };
}

function packedPositions(cloud: PointCloud2, p: Packed, at: Placer, sink: PointSink): number {
  const [e0, e1, e2, , e4, e5, e6, , e8, e9, e10, , e12, e13, e14] = Array.from(at.e);
  const { positions, sources } = sink;
  const { floats, stride } = p;
  const ox = p.x;
  const oy = p.y;
  const oz = p.z;
  const n = cloud.width * cloud.height;
  const first = sink.count;
  const end = positions.length / 3;
  let c = first;

  for (let i = 0; i < n && c < end; i++) {
    const w = i * stride;
    const x = floats[w + ox];
    const y = floats[w + oy];
    const z = floats[w + oz];

    if (!Number.isFinite(x + y + z)) continue;

    const k = c * 3;

    positions[k] = e0 * x + e4 * y + e8 * z + e12;
    positions[k + 1] = e1 * x + e5 * y + e9 * z + e13;
    positions[k + 2] = e2 * x + e6 * y + e10 * z + e14;
    sources[c++] = w;
  }

  sink.count = c;

  return first;
}

function rgbColors(p: Packed, sink: PointSink, from: number) {
  const { colors, sources } = sink;
  const { words, shade } = p;
  const end = sink.count;

  for (let c = from; c < end; c++) {
    const word = words[sources[c] + shade];
    const k = c * 3;

    colors[k] = (word >> 16) & 255;
    colors[k + 1] = (word >> 8) & 255;
    colors[k + 2] = word & 255;
  }
}

function rampColors(p: Packed, sink: PointSink, from: number) {
  const { colors, sources } = sink;
  const { floats, shade, lo, scale } = p;
  const top = LUT_SIZE - 1;
  const end = sink.count;

  for (let c = from; c < end; c++) {
    const t = ((floats[sources[c] + shade] - lo) * scale) | 0;
    const at = (t < 0 ? 0 : Math.min(t, top)) * 3;
    const k = c * 3;

    colors[k] = LUT[at];
    colors[k + 1] = LUT[at + 1];
    colors[k + 2] = LUT[at + 2];
  }
}

function solidColors(sink: PointSink, from: number) {
  const { colors } = sink;
  const [r, g, b] = ACCENT;
  const end = sink.count * 3;

  for (let k = from * 3; k < end; k += 3) {
    colors[k] = r;
    colors[k + 1] = g;
    colors[k + 2] = b;
  }
}

function packedPoints(cloud: PointCloud2, p: Packed, at: Placer, sink: PointSink) {
  const from = packedPositions(cloud, p, at, sink);

  if (p.rgb) rgbColors(p, sink, from);
  else if (p.shade >= 0) rampColors(p, sink, from);
  else solidColors(sink, from);
}

export function cloudPoints(cloud: PointCloud2, at: Placer, sink: PointSink, colorBy: string | null) {
  const layout = cloudLayout(cloud);

  if (!layout) return;

  const fast = packed(cloud, layout, colorBy);

  if (fast) {
    packedPoints(cloud, fast, at, sink);

    return;
  }

  const shade = shaderFor(layout, cloud, colorBy, sink);
  const n = cloud.width * cloud.height;

  for (let i = 0; i < n; i++) {
    const base = i * cloud.point_step;

    readXyz(layout, base);

    if (!Number.isFinite(local[0] + local[1] + local[2])) continue;

    const k = pushPoint(sink, at);

    if (k < 0) return;

    shade(base, k);
  }
}
