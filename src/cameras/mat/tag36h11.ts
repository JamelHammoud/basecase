import { TAG36H11_BIT_X, TAG36H11_BIT_Y, TAG36H11_CODES } from './tag36h11Codes';

export const TAG_CELLS = 10;
export const TAG_BORDER_CELLS = 8;
export const TAG36H11_COUNT = TAG36H11_CODES.length;

export type FloorPoint = [x: number, z: number];

const CODE_BITS = 36;

export function tagCells(id: number): Uint8Array {
  const code = TAG36H11_CODES[id];

  if (code === undefined) throw new Error(`Tag ${id} isn’t in the 36h11 family.`);

  const cells = new Uint8Array(TAG_CELLS * TAG_CELLS);

  for (let y = 1; y <= TAG_BORDER_CELLS; y++) {
    for (let x = 1; x <= TAG_BORDER_CELLS; x++) cells[y * TAG_CELLS + x] = 1;
  }

  for (let i = 0; i < CODE_BITS; i++) {
    const white = Math.floor(code / 2 ** (CODE_BITS - 1 - i)) % 2 === 1;

    if (white) cells[(TAG36H11_BIT_Y[i] + 1) * TAG_CELLS + TAG36H11_BIT_X[i] + 1] = 0;
  }

  return cells;
}

export function tagCorners(center: FloorPoint, size: number, up: FloorPoint): FloorPoint[] {
  const [ux, uz] = up;
  const [rx, rz] = [-uz, ux];
  const h = size / 2;
  const at = (sr: number, su: number): FloorPoint => [
    center[0] + (sr * rx + su * ux) * h,
    center[1] + (sr * rz + su * uz) * h,
  ];

  return [at(-1, 1), at(1, 1), at(1, -1), at(-1, -1)];
}
