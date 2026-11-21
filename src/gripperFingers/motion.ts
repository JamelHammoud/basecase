import { Vector3 } from 'three';
import type { ScenePart } from '../types/robotics';
import { partBounds } from '../utils/selection';
import { jawContactPart } from './contactPart';
import { fingerFrame } from './frames';
import { readFinger } from './dimensions';
import type { FingerPart } from './types';

export function fingerOpening(fingers: FingerPart[], parts: ScenePart[]) {
  if (fingers.length !== 2) throw new Error('Keep both replacement fingers and their references together.');

  const beams = fingers.map((part) => jawContactPart([part])!);
  const frames = fingers.map((part) => fingerFrame(parts.find((item) => item.id === part.gripperFinger.mount)!));
  const across = new Vector3(...beams[1].position).sub(new Vector3(...beams[0].position)).normalize();
  const firstAxis = new Vector3(...frames[0].direction([1, 0, 0]));
  const secondAxis = new Vector3(...frames[1].direction([1, 0, 0]));
  const approaches = frames.map((frame) => new Vector3(...frame.direction([0, 1, 0])));

  if (firstAxis.dot(across) < 0.999 || secondAxis.dot(across) > -0.999 || approaches[0].dot(approaches[1]) < 0.999)
    throw new Error('Align the declared mounting faces with the opposing jaw slides.');

  const openingMm =
    new Vector3(...beams[0].position).distanceTo(new Vector3(...beams[1].position)) -
    (beams[0].dimensions.width + beams[1].dimensions.width) / 2;
  const travel = fingers.reduce((sum, part) => sum + Math.max(...part.gripperFinger.travel.map(Math.abs)), 0);

  return { across: across.toArray(), openingMm, closedOpeningMm: Math.max(0, openingMm - travel) };
}

export function assertFingerSweep(parts: ScenePart[], finger: FingerPart) {
  const ref = finger.gripperFinger;
  const related = new Set(parts.filter((part) => part.gripperFinger?.joint === ref.joint).map((part) => part.id));

  related.add(ref.mount);
  related.add(ref.target);

  const bounds = partBounds(finger);
  const axis = new Vector3(...ref.axis).normalize().toArray();
  const offsets = axis.map((component) => ref.travel.map((limit) => component * limit));
  const low = bounds.min.map((value, axis) => value + Math.min(0, ...offsets[axis]));
  const high = bounds.max.map((value, axis) => value + Math.max(0, ...offsets[axis]));
  const clashes = parts.some((part) => {
    if (related.has(part.id) || part.role !== 'solid' || part.gripperFinger) return false;

    const other = partBounds(part);

    return low.every((value, axis) => Math.min(high[axis], other.max[axis]) - Math.max(value, other.min[axis]) > 0.05);
  });

  if (clashes) throw new Error('Clear the finger sweep through the declared jaw travel.');
}

export function assertMatchingFingers(fingers: FingerPart[]) {
  const dimensions = fingers.map((finger) => readFinger(finger));

  if (JSON.stringify(dimensions[0]) !== JSON.stringify(dimensions[1]))
    throw new Error('Keep both finger dimensions linked.');
}
