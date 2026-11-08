import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { place, type Placed } from '../three/analysis/collide';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import { blocksAlong, ownTravel } from './moveBlockers';

type Box = [x0: number, y0: number, z0: number, x1: number, y1: number, z1: number];

const FACES = [
  [0, 2, 3, 1],
  [4, 5, 7, 6],
  [0, 1, 5, 4],
  [2, 6, 7, 3],
  [0, 4, 6, 2],
  [1, 3, 7, 5],
];

function soup(boxes: Box[]): Float32Array {
  const out: number[] = [];

  for (const [x0, y0, z0, x1, y1, z1] of boxes) {
    const corner = (i: number) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];

    for (const [a, b, c, d] of FACES) out.push(...[a, b, c, a, c, d].flatMap(corner));
  }

  return new Float32Array(out);
}

const solid = (id: string, ...boxes: Box[]): Placed => place(id, solidFromPositions(soup(boxes)), new THREE.Matrix4());

function along(part: Placed, other: Placed, dir: [number, number, number]) {
  const d = new THREE.Vector3(...dir);

  return blocksAlong({ part, dir: d, travel: ownTravel(part, d), candidates: [other] });
}

const rim = (opening: number) =>
  solid(
    'rim',
    [-60, 20, -60, -opening, 22, 60],
    [opening, 20, -60, 60, 22, 60],
    [-opening, 20, -60, opening, 22, -opening],
    [-opening, 20, opening, opening, 22, 60],
  );

describe('straight moves', () => {
  it('a low-poly bar moving into a crossing bar is blocked', () => {
    const bar = solid('p', [-50, -5, -5, 50, 5, 5]);
    const crossing = solid('q', [-5, 20, -50, 5, 30, 50]);

    expect(along(bar, crossing, [0, 1, 0]).solid).toEqual(['q']);
  });

  it('a low-poly bar moving away from the crossing bar is free', () => {
    const bar = solid('p', [-50, -5, -5, 50, 5, 5]);
    const crossing = solid('q', [-5, 20, -50, 5, 30, 50]);

    expect(along(bar, crossing, [0, -1, 0])).toEqual({ solid: [], lips: [] });
  });

  it('a plate sliding along a wall it touches is free', () => {
    const plate = solid('p', [0, 0, 0, 50, 4, 50]);
    const wall = solid('q', [50, -20, -20, 54, 40, 90]);

    expect(along(plate, wall, [0, 0, 1])).toEqual({ solid: [], lips: [] });
  });

  const tray = solid('tray', [-40, 10, -40, 40, 14, 40]);

  it('a tray wider than the opening above it is blocked outright', () => {
    expect(along(tray, rim(30), [0, 1, 0])).toEqual({ solid: ['rim'], lips: [] });
  });

  it('a tray narrower than the opening lifts out', () => {
    expect(along(tray, rim(45), [0, 1, 0])).toEqual({ solid: [], lips: [] });
  });

  it('sliding along a flat contact face is not a block', () => {
    const lower = solid('lower', [-20, 0, -20, 20, 10, 20]);
    const upper = solid('upper', [-20, 10, -20, 20, 14, 20]);

    expect(along(upper, lower, [1, 0, 0])).toEqual({ solid: [], lips: [] });
  });

  it('a small hook behind a wall reads as a lip, not a solid block', () => {
    const plate = Array.from({ length: 36 }, (_, i): Box => {
      const [x, y] = [-30 + (i % 6) * 10, -30 + Math.floor(i / 6) * 8];

      return [x, y, 1, x + 10, y + 8, 5];
    });
    const cap = solid('cap', ...plate, [-4, 18, -3, 4, 19.9, 1], [-4, 19.9, -3, 4, 28, -1.5]);
    const wall = solid('wall', [-40, 20, -1, 40, 40, 1]);

    expect(along(cap, wall, [0, 0, 1])).toEqual({ solid: [], lips: ['wall'] });
  });
});
