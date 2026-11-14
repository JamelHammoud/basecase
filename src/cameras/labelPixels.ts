import type { V3 } from '../utils/kinematics';
import type { VisionAnnotation, VisionKeypoint } from '../vision/frameSet';
import { visibleContours } from './labelContours';

export interface LabelInstance {
  id: number;
  partId: string;
  partIds?: string[];
  classId: number;
  keypoints: Record<string, V3>;
}

interface RasterLabels {
  raster: Uint32Array;
  width: number;
  height: number;
  instances: LabelInstance[];
  keypoints: Record<number, Record<string, VisionKeypoint>>;
}

interface Visible {
  left: number;
  top: number;
  right: number;
  bottom: number;
  last: number;
  counts: number[];
}

const packed = (bytes: Uint8Array, offset: number) =>
  bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;

function decodePixels(bytes: Uint8Array, width: number, height: number): Uint32Array {
  const result = new Uint32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) result[y * width + x] = packed(bytes, ((height - y - 1) * width + x) * 4);
  }

  return result;
}

export const decodeInstancePixels = decodePixels;

export const decodeDepthPixels = (bytes: Uint8Array, width: number, height: number): Float32Array =>
  Float32Array.from(decodePixels(bytes, width, height), (value) => value / 100);

function addPixel(visible: Visible, x: number, y: number, offset: number): void {
  visible.left = Math.min(visible.left, x);
  visible.top = Math.min(visible.top, y);
  visible.right = Math.max(visible.right, x);
  visible.bottom = Math.max(visible.bottom, y);

  if (visible.counts.length && visible.last + 1 === offset) visible.counts[visible.counts.length - 1]++;
  else visible.counts.push(offset - visible.last - 1, 1);

  visible.last = offset;
}

function visiblePixels({ raster, width, height }: RasterLabels): Map<number, Visible> {
  const found = new Map<number, Visible>();

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const id = raster[y * width + x];

      if (!id) continue;

      const visible = found.get(id) ?? {
        left: width,
        top: height,
        right: 0,
        bottom: 0,
        last: -1,
        counts: [],
      };

      addPixel(visible, x, y, x * height + y);
      found.set(id, visible);
    }
  }

  return found;
}

export function annotationsForRaster(input: RasterLabels): VisionAnnotation[] {
  const { raster, width, height, instances, keypoints } = input;
  const found = visiblePixels(input);

  return instances.flatMap((instance) => {
    const visible = found.get(instance.id);

    if (!visible) return [];

    const bbox: [number, number, number, number] = [
      visible.left,
      visible.top,
      visible.right - visible.left + 1,
      visible.bottom - visible.top + 1,
    ];
    const counts = [...visible.counts, width * height - visible.last - 1];

    return [
      {
        id: String(instance.id),
        partId: instance.partId,
        classId: instance.classId,
        bbox,
        mask: { size: [height, width] as [number, number], counts },
        polygons: visibleContours({ raster, width, height, id: instance.id, bbox }),
        keypoints: keypoints[instance.id] ?? {},
      },
    ];
  });
}
