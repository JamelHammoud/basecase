import type { AgentCadPayload } from './cadMesh';

export type CadBox = [[number, number, number], [number, number, number]];

const BOX_TRIANGLES = [
  0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5,
];

export function boxPlaceholder(code: string, [min, max]: CadBox): AgentCadPayload {
  const positions = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) => [
    k & 1 ? max[0] : min[0],
    k & 2 ? max[1] : min[1],
    k & 4 ? max[2] : min[2],
  ]);

  return { language: 'openscad', code, positions, indices: BOX_TRIANGLES };
}
