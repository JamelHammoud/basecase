import { describe, expect, it, vi } from 'vitest';
import { latheTriangles } from './edgedGeometry';
import type { Vec2 } from './edgedProfile';

type Point = [number, number, number];

function formerLathe(profile: Vec2[], closed: boolean): number[] {
  const values: number[] = [];
  const at = ([u, y]: Vec2, i: number): Point => {
    const theta = (i / 48) * Math.PI * 2;

    return [u * Math.sin(theta), y, u * Math.cos(theta)];
  };
  const add = (a: Point, b: Point, c: Point) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];

    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) > 1e-9) values.push(...a, ...b, ...c);
  };
  const spans = closed ? profile.length : profile.length - 1;

  for (let j = 0; j < spans; j++) {
    for (let i = 0; i < 48; i++) {
      const a = at(profile[j], i);
      const b = at(profile[j], i + 1);
      const c = at(profile[(j + 1) % profile.length], i + 1);
      const d = at(profile[(j + 1) % profile.length], i);

      add(a, b, c);
      add(a, c, d);
    }
  }

  return values;
}

describe('edged lathe ring reuse', () => {
  it('preserves exact triangle values, ordering, seams and degenerate filtering', () => {
    const profiles: Vec2[][] = [
      [],
      [[3, 1]],
      [
        [0, -4],
        [5, -4],
        [5, 4],
        [0, 4],
      ],
      [
        [5, -4],
        [5, 4],
        [3, 4],
        [3, -4],
      ],
      [
        [0, 0],
        [0, 0],
        [1e-12, 1e-12],
        [-0, -0],
      ],
      [
        [-3, -5],
        [4, 2],
        [4, 2],
        [0, 7],
      ],
    ];

    for (let seed = 1; seed <= 40; seed++) {
      profiles.push(
        Array.from({ length: 3 + (seed % 12) }, (_, i): Vec2 => [5 + 3 * Math.sin(seed * 13 + i), i * (seed / 7)]),
      );
    }

    for (const profile of profiles) {
      const before = structuredClone(profile);

      for (const closed of [false, true]) expect(latheTriangles(profile, closed)).toEqual(formerLathe(profile, closed));

      expect(profile).toEqual(before);
    }
  });

  it('reads edited profiles afresh and keeps earlier output independent', () => {
    const profile: Vec2[] = [
      [2, -1],
      [4, 1],
      [2, 3],
    ];
    const first = latheTriangles(profile, true);
    const expected = formerLathe(profile, true);

    profile[1][0] = 8;
    expect(latheTriangles(profile, false)).toEqual(formerLathe(profile, false));
    expect(first).toEqual(expected);
  });

  it.each([32, 64])('uses prepared angles across all %i spans', (spans) => {
    const profile = Array.from({ length: spans + 1 }, (_, i): Vec2 => [5 + i / 10, i]);
    const sin = vi.spyOn(Math, 'sin');
    const cos = vi.spyOn(Math, 'cos');

    try {
      expect(latheTriangles(profile, false)).toHaveLength(spans * 48 * 18);
      expect(sin).not.toHaveBeenCalled();
      expect(cos).not.toHaveBeenCalled();
    } finally {
      sin.mockRestore();
      cos.mockRestore();
    }
  });
});
