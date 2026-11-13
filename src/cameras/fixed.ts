import { clampLens, type Lens } from './lens';
import type { V3 } from '../utils/kinematics';

export interface FixedCamera {
  id: string;
  name: string;
  position: V3;
  target: V3;
  lens: Lens;
}

export const MAX_FIXED_CAMERAS = 8;

const isVec3 = (v: unknown): v is V3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

function readLens(v: unknown): Lens | null {
  if (typeof v !== 'object' || v === null) return null;

  const o = v as Record<string, unknown>;

  if (o.model === 'fisheye' && typeof o.fovDeg === 'number') return clampLens({ model: 'fisheye', fovDeg: o.fovDeg });

  if (o.model === 'pinhole' && typeof o.hfovDeg === 'number')
    return clampLens({ model: 'pinhole', hfovDeg: o.hfovDeg });

  return null;
}

export function readFixedCamera(v: unknown): FixedCamera | null {
  if (typeof v !== 'object' || v === null) return null;

  const o = v as Record<string, unknown>;
  const lens = readLens(o.lens);

  if (typeof o.id !== 'string' || typeof o.name !== 'string' || !lens) return null;

  if (!isVec3(o.position) || !isVec3(o.target)) return null;

  return { id: o.id, name: o.name.slice(0, 64), position: o.position, target: o.target, lens };
}

export const readFixedCameras = (v: unknown): FixedCamera[] =>
  Array.isArray(v) ? v.flatMap((c) => readFixedCamera(c) ?? []).slice(0, MAX_FIXED_CAMERAS) : [];

export function nextCameraName(cameras: FixedCamera[]): string {
  const taken = new Set(cameras.map((c) => c.name));
  let n = cameras.length + 1;

  while (taken.has(`Camera ${n}`)) n++;

  return `Camera ${n}`;
}
