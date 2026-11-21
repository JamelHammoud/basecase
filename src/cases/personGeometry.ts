import type { ModelMeshData } from '../types/model';
import type { V3 } from '../utils/kinematics';

export interface PersonShape {
  name: string;
  center: V3;
  size: V3;
}

export function personShapes([width, height, depth]: V3): PersonShape[] {
  const shape = (name: string, center: V3, size: V3): PersonShape => ({
    name,
    center: center.map((n, i) => n * [width, height, depth][i]) as V3,
    size: size.map((n, i) => n * [width, height, depth][i]) as V3,
  });

  return [
    shape('head', [0, 0.42, 0], [0.36, 0.16, 0.8]),
    shape('torso', [0, 0.125, 0], [0.64, 0.43, 1]),
    shape('left-arm', [-0.42, 0.1, 0], [0.16, 0.4, 0.65]),
    shape('right-arm', [0.42, 0.1, 0], [0.16, 0.4, 0.65]),
    shape('left-leg', [-0.19, -0.295, 0], [0.24, 0.41, 0.75]),
    shape('right-leg', [0.19, -0.295, 0], [0.24, 0.41, 0.75]),
  ];
}

const CORNERS = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];
const FACES = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
];

export function personMesh(size: V3): ModelMeshData {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const shape of personShapes(size)) {
    const offset = positions.length / 3;

    for (const corner of CORNERS) positions.push(...corner.map((n, i) => shape.center[i] + (n * shape.size[i]) / 2));

    indices.push(...FACES.map((n) => n + offset));
  }

  return { positions, indices, baseSize: [...size] };
}
