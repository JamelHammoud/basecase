import * as THREE from 'three';
import type { LaserScan, PointCloud2 } from './messages';
import { cloudPoints, laserScanPoints } from './points';
import { MAX_POINTS, placer, pointSink, type PointSink } from './pointSink';

export interface DepthImage {
  width: number;
  height: number;
  step: number;
  encoding: string;
  is_bigendian: number | boolean;
  data: Uint8Array;
}

export interface Intrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

export const DEPTH_STRIDE = 4;
export const DEPTH_MAX_M = 10;

const DEPTH_ENCODINGS = new Set(['16UC1', 'mono16', '32FC1']);

const IDENTITY = placer(new THREE.Matrix4());

const filled = (sink: PointSink) => sink.positions.slice(0, sink.count * 3);

export function scanSweep(scan: LaserScan): Float32Array {
  if (
    !Number.isSafeInteger(scan.ranges?.length) ||
    scan.ranges.length <= 0 ||
    ![scan.angle_min, scan.angle_increment, scan.range_min, scan.range_max].every(Number.isFinite)
  )
    return new Float32Array();

  const capacity = Math.min(scan.ranges.length, MAX_POINTS);
  const sink = pointSink(capacity);
  const ranges =
    scan.ranges.length > capacity ? Float32Array.from({ length: capacity }, (_, i) => scan.ranges[i]) : scan.ranges;

  laserScanPoints({ ...scan, ranges }, IDENTITY, sink, null);

  return filled(sink);
}

const FIELD_BYTES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 4, 8: 8 };

function readableCloud(cloud: PointCloud2): boolean {
  if (!Array.isArray(cloud.fields) || !(cloud.data instanceof Uint8Array)) return false;

  const shape = [cloud.width, cloud.height, cloud.point_step, cloud.row_step];
  const fields = ['x', 'y', 'z'].map((name) => cloud.fields.find((field) => field.name === name));

  return (
    shape.every((n) => Number.isSafeInteger(n) && n > 0) &&
    cloud.row_step >= cloud.width * cloud.point_step &&
    fields.every(
      (field) =>
        field &&
        Number.isSafeInteger(field.offset) &&
        field.offset >= 0 &&
        FIELD_BYTES[field.datatype] > 0 &&
        field.offset + FIELD_BYTES[field.datatype] <= cloud.point_step,
    )
  );
}

export function cloudSweep(cloud: PointCloud2): Float32Array {
  if (!readableCloud(cloud)) return new Float32Array();

  const capacity = Math.min(
    MAX_POINTS,
    cloud.width * cloud.height,
    Math.floor(cloud.data.byteLength / cloud.point_step),
  );
  const sink = pointSink(capacity);

  for (
    let row = 0;
    row < cloud.height && row * cloud.row_step < cloud.data.byteLength && sink.count < capacity;
    row++
  ) {
    const start = row * cloud.row_step;
    const width = Math.min(cloud.width, Math.floor((cloud.data.byteLength - start) / cloud.point_step));
    const data = cloud.data.subarray(start, start + width * cloud.point_step);

    cloudPoints({ ...cloud, height: 1, width, data }, IDENTITY, sink, null);
  }

  return filled(sink);
}

export const isDepth = (image: Pick<DepthImage, 'encoding'>) => DEPTH_ENCODINGS.has(image.encoding);

export function intrinsicsOf(k: ArrayLike<number> | undefined): Intrinsics | null {
  if (!k || k.length < 6 || ![k[0], k[2], k[4], k[5]].every(Number.isFinite) || k[0] <= 0 || k[4] <= 0) return null;

  return { fx: k[0], fy: k[4], cx: k[2], cy: k[5] };
}

function depthReader(image: DepthImage): ((u: number, v: number) => number) | null {
  if (!(image.data instanceof Uint8Array)) return null;

  const float = image.encoding === '32FC1';
  const size = float ? 4 : 2;
  const shape = [image.width, image.height, image.step];

  if (!isDepth(image) || !shape.every((n) => Number.isSafeInteger(n) && n > 0) || image.step < image.width * size)
    return null;

  const view = new DataView(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  const little = !image.is_bigendian;

  return (u, v) => {
    const at = v * image.step + u * size;

    if (at + size > image.data.byteLength) return Number.NaN;

    return float ? view.getFloat32(at, little) : view.getUint16(at, little) / 1000;
  };
}

export function depthSweep(image: DepthImage, lens: Intrinsics, stride = DEPTH_STRIDE): Float32Array {
  if (!Number.isInteger(stride) || stride < 1) throw new RangeError('Choose a positive whole depth stride.');

  const read = depthReader(image);

  if (!read) return new Float32Array();

  const out: number[] = [];
  const height = Math.min(image.height, Math.ceil(image.data.byteLength / image.step));
  const size = image.encoding === '32FC1' ? 4 : 2;

  for (let v = 0; v < height && out.length < MAX_POINTS * 3; v += stride) {
    const width = Math.min(image.width, Math.floor((image.data.byteLength - v * image.step) / size));

    for (let u = 0; u < width && out.length < MAX_POINTS * 3; u += stride) {
      const z = read(u, v);

      if (!(z > 0 && z <= DEPTH_MAX_M)) continue;

      out.push(((u - lens.cx) * z) / lens.fx, ((v - lens.cy) * z) / lens.fy, z);
    }
  }

  return Float32Array.from(out);
}
