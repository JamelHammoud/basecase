import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { thinWallOf } from '../utils/printReport';
import { checkPrintability } from './printability';

const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g).attributes.position.array as Float32Array;

function detailedBlockWith(panel: THREE.BufferGeometry): Float32Array {
  const block = new THREE.BoxGeometry(40, 40, 40, 16, 16, 16).translate(80, 0, 0);
  const [a, b] = [flat(block), flat(panel)];
  const all = new Float32Array(a.length + b.length);

  all.set(a);
  all.set(b, a.length);

  return all;
}

function plateWithBlindPocket(radius: number): Float32Array {
  const [w, centroid] = [100, 100 / 6];
  const shape = new THREE.Shape()
    .moveTo(-w / 2, -w / 2)
    .lineTo(w / 2, -w / 2)
    .lineTo(w / 2, w / 2)
    .lineTo(-w / 2, w / 2)
    .closePath();

  shape.holes.push(new THREE.Path().absarc(centroid, -centroid, radius, 0, Math.PI * 2, true));

  const body = flat(
    new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: false, curveSegments: 16 }).rotateX(-Math.PI / 2),
  );
  const out: number[] = [];

  for (let t = 0; t < body.length; t += 9) {
    if (Math.max(body[t + 1], body[t + 4], body[t + 7]) > 1e-3) out.push(...body.subarray(t, t + 9));
  }

  const half = w / 2;
  const [a, b, c, d] = [
    [-half, 0, -half],
    [half, 0, -half],
    [half, 0, half],
    [-half, 0, half],
  ];

  out.push(...a, ...b, ...c, ...a, ...c, ...d);

  for (let i = 0; i < 32; i++) {
    const [p, q] = [i, i + 1].map((k) => (k / 32) * Math.PI * 2);

    out.push(
      centroid,
      0.5,
      centroid,
      centroid + radius * Math.cos(q),
      0.5,
      centroid + radius * Math.sin(q),
      centroid + radius * Math.cos(p),
      0.5,
      centroid + radius * Math.sin(p),
    );
  }

  return new Float32Array(out);
}

describe('thin wall area', () => {
  it('counts a big panel made of a few triangles at its full area', () => {
    const check = checkPrintability(detailedBlockWith(new THREE.BoxGeometry(40, 0.5, 40)))!;

    expect(check.thinAreaMm2).toBeGreaterThan(2800);
    expect(thinWallOf(check)).toBe('panel');
  });

  it('reads the same panel the same way when its mesh is dense', () => {
    const coarse = checkPrintability(detailedBlockWith(new THREE.BoxGeometry(40, 0.5, 40)))!;
    const dense = checkPrintability(detailedBlockWith(new THREE.BoxGeometry(40, 0.5, 40, 40, 1, 40)))!;

    expect(coarse.thinAreaMm2 / dense.thinAreaMm2).toBeGreaterThan(0.8);
    expect(coarse.thinAreaMm2 / dense.thinAreaMm2).toBeLessThan(1.25);
  });

  it('finds nothing thin on a solid block', () => {
    const check = checkPrintability(flat(new THREE.BoxGeometry(40, 40, 40)))!;

    expect(check.thinAreaMm2).toBe(0);
    expect(thinWallOf(check)).toBe('none');
  });

  it('keeps a small blind pocket behind a big triangle from reading as a panel', () => {
    const check = checkPrintability(plateWithBlindPocket(3))!;

    expect(check.minWallMm).toBeLessThan(0.84);
    expect(thinWallOf(check)).toBe('edge');
  });

  it('still reads a wide blind pocket as a panel', () => {
    expect(thinWallOf(checkPrintability(plateWithBlindPocket(20))!)).toBe('panel');
  });
});
