import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CROSS_RECESS, TORX_RECESS, type ScrewRecess } from '../data/hardware';
import { prism } from './hardwarePrimitives';
import { recessCutter } from './hardwareRecess';

type Point = [number, number];

type Cross = Extract<ScrewRecess, { kind: 'phillips' | 'pozidriv' }>;

function crossPoints(recess: Cross, diameter: number): Point[] {
  const m = CROSS_RECESS[recess.size]?.m ?? diameter * 0.5;
  const h = m / 2;
  const q = m / 12;
  const t = m * 0.26;
  const d = m * 0.025;
  const quarter: Point[] = [
    [h, -q],
    [h, q],
  ];

  if (recess.kind === 'phillips') quarter.push([q, q]);
  else quarter.push([q + 2 * d, q], [t + d, t - d], [t - d, t + d], [q, q + 2 * d]);

  const points: Point[] = [];

  for (let i = 0; i < 4; i++) {
    const c = Math.cos((i * Math.PI) / 2);
    const s = Math.sin((i * Math.PI) / 2);

    for (const [x, y] of quarter) points.push([x * c - y * s, x * s + y * c]);
  }

  return points;
}

function previousShape(recess: ScrewRecess, diameter: number) {
  let points: Point[];

  if (recess.kind === 'torx') {
    const { A, B } = TORX_RECESS[recess.size] ?? { A: diameter * 0.4, B: diameter * 0.3 };

    points = Array.from({ length: 73 }, (_, i) => {
      const a = (i / 72) * Math.PI * 2;
      const r = (A + B) / 4 + ((A - B) / 4) * Math.cos(6 * a);

      return [r * Math.cos(a), r * Math.sin(a)];
    });
  } else if (recess.kind === 'phillips' || recess.kind === 'pozidriv') {
    points = crossPoints(recess, diameter);
  } else {
    const w = recess.kind === 'slot' ? recess.width / 2 : 0;
    const l = diameter / 2 + 1;

    points = [
      [-l, -w],
      [l, -w],
      [l, w],
      [-l, w],
    ];
  }

  const shape = new THREE.Shape();

  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));

  if (recess.kind !== 'torx') shape.closePath();

  return shape;
}

function previousCutter(recess: ScrewRecess, options: { diameter: number; y: number; depth: number }) {
  const { diameter, y, depth } = options;
  const g = prism(previousShape(recess, diameter), depth + 1, y - depth);

  if (recess.kind !== 'phillips' && recess.kind !== 'pozidriv') return g;

  const taper = recess.kind === 'pozidriv' ? 0.6 : 0.75;
  const pos = g.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const below = Math.max(0, y - pos.getY(i)) / depth;
    const f = 1 - taper * below;

    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i), pos.getZ(i) * f);
  }

  g.computeVertexNormals();

  return g;
}

const recesses: ScrewRecess[] = [
  ...Object.keys(TORX_RECESS).map((size): ScrewRecess => ({ kind: 'torx', size })),
  { kind: 'torx', size: 'fallback' },
  ...['phillips', 'pozidriv'].flatMap((kind) =>
    [...Object.keys(CROSS_RECESS), 'fallback'].map((size) => ({ kind, size }) as Cross),
  ),
  ...[0.1, 0.6, 1, 2.5].map((width): ScrewRecess => ({ kind: 'slot', width })),
];

describe('screw recess outlines', () => {
  it('preserves complete cutter buffers across catalog drives, fallback sizes and placements', () => {
    for (const recess of recesses) {
      for (const diameter of [2, 5, 12]) {
        const options = { diameter, y: diameter / 3, depth: diameter / 4 };
        const actual = recessCutter(recess, options.y, options.depth, diameter);
        const expected = previousCutter(recess, options);

        expect(actual.toJSON().data, JSON.stringify({ recess, diameter })).toEqual(expected.toJSON().data);
        actual.dispose();
        expected.dispose();
      }
    }
  });
});
