import { scadDimensions } from '../../electron/cad-kernel/dimensions.mjs';
import type { ScenePart } from '../types/robotics';
import { fingerCode, mountCode, FINGER_BODY, MOUNT_BODY } from './cad';
import type { FingerDimensions, MountDimensions } from './types';

function valuesOf(part: ScenePart, body: string): Record<string, number> | null {
  const cad = part.cad;

  if (part.kind !== 'cad_part' || cad?.language !== 'openscad' || cad.code.slice(cad.code.indexOf('assert')) !== body)
    return null;

  if (
    [
      part.deformers,
      part.mesh,
      part.sculptMesh,
      part.boolean,
      part.csg,
      part.sketch,
      part.customNodes,
      part.edges,
      part.sheetTransform,
      part.role !== 'solid',
    ].some(Boolean) ||
    [part.dimensions.width, part.dimensions.height, part.dimensions.depth].some(
      (value, axis) => Math.abs(value - cad.baseSize[axis]) > 0.011,
    )
  )
    return null;

  const values = Object.fromEntries(scadDimensions(cad.code).map((dimension) => [dimension.name, dimension.value]));

  return values;
}

const mountValues = (v: Record<string, number>): MountDimensions => ({
  height: v.mount_height,
  depth: v.mount_depth,
  spacing: v.mount_spacing,
});

export function readMount(part: ScenePart): MountDimensions | null {
  const values = valuesOf(part, MOUNT_BODY);

  if (!values) return null;

  const dimensions = mountValues(values);

  return Object.values(dimensions).every(Number.isFinite) && part.cad!.code === mountCode(dimensions)
    ? dimensions
    : null;
}

export function readFinger(part: ScenePart): FingerDimensions | null {
  const v = valuesOf(part, FINGER_BODY);

  const dimensions = v
    ? {
        ...mountValues(v),
        length: v.finger_length,
        thickness: v.finger_thickness,
        clearance: v.finger_clearance,
        v: v.finger_v,
      }
    : null;

  return dimensions && Object.values(dimensions).every(Number.isFinite) && part.cad!.code === fingerCode(dimensions)
    ? dimensions
    : null;
}

export function assertFingerDimensions(d: FingerDimensions) {
  const valid =
    Object.values(d).every(Number.isFinite) &&
    d.spacing >= 10 &&
    d.height >= d.spacing + 12 &&
    d.height <= 50 &&
    d.depth >= 16 &&
    d.depth <= 40 &&
    d.length >= 12 &&
    d.length <= 100 &&
    d.thickness >= 3.5 &&
    d.thickness <= 4.5 &&
    d.clearance >= 0.1 &&
    d.clearance <= 4 &&
    (d.v === 0 || d.v === 1);

  if (!valid)
    throw new Error('Keep the finger walls, mounting holes and screw engagement within the declared M3 interface.');
}
