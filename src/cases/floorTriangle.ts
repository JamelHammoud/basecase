import type { V3 } from '../utils/kinematics';

interface FloorEdge {
  x: number;
  z: number;
  dx: number;
  dz: number;
}

export type FloorTriangle = [FloorEdge, FloorEdge, FloorEdge];

const edge = (a: V3, b: V3): FloorEdge => ({ x: a[0], z: a[2], dx: b[0] - a[0], dz: b[2] - a[2] });

export const prepareFloorTriangle = ([a, b, c]: [V3, V3, V3]): FloorTriangle => [edge(a, b), edge(b, c), edge(c, a)];

const side = (point: V3, edge: FloorEdge) => edge.dx * (point[2] - edge.z) - edge.dz * (point[0] - edge.x);

export function coversFloorPoint(point: V3, [a, b, c]: FloorTriangle): boolean {
  const ab = side(point, a);
  const bc = side(point, b);
  const ca = side(point, c);

  return (ab >= -1e-6 && bc >= -1e-6 && ca >= -1e-6) || (ab <= 1e-6 && bc <= 1e-6 && ca <= 1e-6);
}
