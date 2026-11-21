import type { ScenePart } from '../types/robotics';
import type { V3 } from '../utils/kinematics';
import { assertFingerDimensions, readFinger } from './dimensions';

function box(min: V3, max: V3): V3[] {
  return Array.from(
    { length: 8 },
    (_, corner) => min.map((value, axis) => (corner & (1 << axis) ? max[axis] : value)) as V3,
  );
}

function prism(profile: Array<[number, number]>, from: number, to: number): V3[] {
  return [from, to].flatMap((y) => profile.map(([x, z]): V3 => [x, y, z]));
}

export function fingerCollisionPieces(part: ScenePart): Float32Array[] | undefined {
  if (part.gripperFinger?.role !== 'finger') return undefined;

  const d = readFinger(part);

  if (!d || !part.cad) throw new Error('Restore the declared finger geometry before simulating.');

  assertFingerDimensions(d);

  const t = d.thickness;
  const c = d.clearance;
  const half = d.depth / 2;
  const end = t + d.length;
  const pieces = [box([-10 - t, -d.height, -half], [-10, t, half]), box([-10, 0, -half], [-c, t, half])];

  if (d.v === 0) pieces.push(box([-t - c, t, -half], [-c, end, half]));
  else
    pieces.push(
      box([-t - c, t, -half], [-1 - c, end, half]),
      box([-1 - c, t, -half], [-c, end, -1]),
      box([-1 - c, t, 1], [-c, end, half]),
      prism(
        [
          [-1 - c, 0],
          [-1 - c, 1],
          [-c, 1],
        ],
        t,
        end,
      ),
      prism(
        [
          [-1 - c, 0],
          [-c, -1],
          [-1 - c, -1],
        ],
        t,
        end,
      ),
    );

  const center = part.cad.originOffset;

  return pieces.map((piece) =>
    Float32Array.from(piece.flatMap((point) => point.map((value, axis) => value - center[axis]))),
  );
}
