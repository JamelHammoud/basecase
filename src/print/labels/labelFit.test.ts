import { describe, expect, it } from 'vitest';
import { boundaryClearance } from './labelBoundary';
import type { FlatFace } from './labelFaces';
import { fitLabel, insideFace, labelBox, LABEL_MM, strokeOf, type LabelSpot } from './labelFit';
import { textWidth } from './labelFont';

type Point = [number, number];

function tiledFace(width: number, height: number, shape: number): FlatFace {
  const cells = Array.from({ length: 36 }, (_, i) => {
    const x = i % 6;
    const y = Math.floor(i / 6);

    if (shape === 1) return x < 2 || y < 2;

    if (shape === 2) return x < 2 || x > 3 || y < 2 || y > 3;

    return shape !== 3 || x < 3 || y < 2 || y > 3;
  });
  const tris: number[] = [];
  const edges: number[] = [];
  const centers: Point[] = [];
  const occupied = (x: number, y: number) => x >= 0 && x < 6 && y >= 0 && y < 6 && cells[y * 6 + x];

  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;

    const x = i % 6;
    const y = Math.floor(i / 6);
    const corners: Point[] = [
      [(x * width) / 6, (y * height) / 6],
      [((x + 1) * width) / 6, (y * height) / 6],
      [((x + 1) * width) / 6, ((y + 1) * height) / 6],
      [(x * width) / 6, ((y + 1) * height) / 6],
    ];
    const neighbors = [occupied(x, y - 1), occupied(x + 1, y), occupied(x, y + 1), occupied(x - 1, y)];

    tris.push(...corners[0], ...corners[1], ...corners[2], ...corners[0], ...corners[2], ...corners[3]);
    centers.push([((x + 0.5) * width) / 6, ((y + 0.5) * height) / 6]);

    for (let k = 0; k < 4; k++) if (!neighbors[k]) edges.push(...corners[k], ...corners[(k + 1) % 4]);
  }

  return {
    normal: [0, 0, 1],
    offset: 0,
    area: (centers.length * width * height) / 36,
    u: [1, 0, 0],
    v: [0, 1, 0],
    tris: Float32Array.from(tris),
    edges: Float32Array.from(edges),
    centroid: centers.reduce<Point>(
      (sum, p) => [sum[0] + p[0] / centers.length, sum[1] + p[1] / centers.length],
      [0, 0],
    ),
  };
}

function exhaustiveHeight(face: FlatFace, spot: LabelSpot, text: string): number {
  const clear = boundaryClearance(face.edges);
  const fits = (height: number) => clear(labelBox({ ...spot, height }, textWidth(text)));

  if (fits(10)) return 10;

  if (!fits(4)) return 0;

  let low = 4;
  let high = 10;

  for (let i = 0; i < 12; i++) {
    const height = (low + high) / 2;

    if (fits(height)) low = height;
    else high = height;
  }

  return low;
}

function exhaustiveFit(face: FlatFace, text: string): LabelSpot | null {
  const xs = face.tris.filter((_, i) => i % 2 === 0);
  const ys = face.tris.filter((_, i) => i % 2 === 1);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const grid: Point[] = [];
  const distance = (p: Point) => Math.hypot(p[0] - face.centroid[0], p[1] - face.centroid[1]);

  for (let i = 0; i <= 8; i++)
    for (let j = 0; j <= 8; j++) grid.push([minX + ((maxX - minX) * i) / 8, minY + ((maxY - minY) * j) / 8]);

  grid.sort((a, b) => distance(a) - distance(b) || a[0] - b[0] || a[1] - b[1]);

  const centers = [face.centroid, ...grid].filter((p) => insideFace(face, p));
  let best: LabelSpot | null = null;

  for (const at of centers) {
    for (const turned of [false, true]) {
      const spot = { at, turned, height: 0, stroke: 0 };
      const height = exhaustiveHeight(face, spot, text);

      if (height > (best?.height ?? 0) + 1e-6) best = { ...spot, height, stroke: strokeOf(height) };
    }

    if (best?.height === 10) break;
  }

  return best;
}

function fanTriangles(count: number): Float32Array {
  const perimeter = Array.from({ length: count }, (_, i): Point => {
    const position = (i * 4) / count;
    const along = position % 1;
    const sides: Point[] = [
      [along * 80, 0],
      [80, along * 80],
      [(1 - along) * 80, 80],
      [0, (1 - along) * 80],
    ];

    return sides[Math.floor(position)];
  });

  return Float32Array.from(perimeter.flatMap((point, i) => [40, 40, ...point, ...perimeter[(i + 1) % count]]));
}

function countedTriangles(source: Float32Array) {
  let reads = 0;
  const tris = new Proxy(source, {
    get(target, key) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

      const value = Reflect.get(target, key, target);

      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  return { tris, reads: () => reads };
}

describe('printed-label candidate search', () => {
  it('matches exhaustive fitting across holes, notches, rotations, ties, rejections and later edits', () => {
    let seed = 41;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return 5 + (seed % 1200) / 16;
    };
    const results: Array<LabelSpot | null> = [];

    for (let i = 0; i < 80; i++) {
      const face = tiledFace(next(), next(), i % 4);
      const originalTris = face.tris.slice();
      const originalEdges = face.edges.slice();
      const originalCentroid = [...face.centroid];

      for (const text of ['A', 'MW', 'AAA']) {
        const result = fitLabel(face, text);

        expect(result).toEqual(exhaustiveFit(face, text));
        results.push(result);
      }

      expect(face.tris).toEqual(originalTris);
      expect(face.edges).toEqual(originalEdges);
      expect(face.centroid).toEqual(originalCentroid);
      face.centroid = [1, 1];
      face.edges[0] += 0.25;
      expect(fitLabel(face, 'A')).toEqual(exhaustiveFit(face, 'A'));
    }

    expect(results.some((spot) => spot === null)).toBe(true);
    expect(results.some((spot) => spot?.turned)).toBe(true);
    expect(results.some((spot) => spot && spot.height < LABEL_MM.maxHeight)).toBe(true);
    expect(results.some((spot) => spot?.height === LABEL_MM.maxHeight)).toBe(true);
  });

  it('keeps the centroid and first orientation when full-size candidates tie', () => {
    const face = tiledFace(80, 80, 0);

    expect(fitLabel(face, 'A')).toEqual({ at: face.centroid, turned: false, height: 10, stroke: 1.4 });
  });

  it('fits a dense face through the fallback grid without a spread argument limit', () => {
    const face = tiledFace(120, 120, 2);
    const expected = exhaustiveFit(face, 'MW');
    const source = face.tris;
    const tris = new Float32Array(source.length * 1000 + 4);
    const view = tris.subarray(2, -2);

    for (let i = 0; i < view.length; i += source.length) view.set(source, i);

    face.tris = view;

    expect(insideFace(face, face.centroid)).toBe(false);
    expect(view.length / 2).toBeGreaterThan(125000);
    expect(fitLabel(face, 'MW')).toEqual(expected);
    expect(view.subarray(0, source.length)).toEqual(source);
    expect(tris[0]).toBe(0);
    expect(tris.at(-1)).toBe(0);
  });

  it('searches beyond a centroid in a hole and rejects an empty face', () => {
    const face = tiledFace(120, 120, 2);
    const spot = fitLabel(face, 'MW')!;

    expect(insideFace(face, face.centroid)).toBe(false);
    expect(spot.height).toBe(10);
    expect(spot.at).not.toEqual(face.centroid);
    expect(insideFace(face, spot.at)).toBe(true);
    expect(fitLabel({ ...face, tris: new Float32Array(), edges: new Float32Array() }, 'A')).toBeNull();
  });

  it.each([300, 600])('stops reading a %i-triangle face when the centroid fits at full size', (count) => {
    const face = tiledFace(80, 80, 0);
    const source = fanTriangles(count);
    const counted = countedTriangles(source);

    face.tris = counted.tris;
    face.centroid = [40, 40];

    expect(fitLabel(face, 'A')).toEqual({ at: face.centroid, turned: false, height: 10, stroke: 1.4 });
    expect(counted.reads()).toBeLessThanOrEqual(6);

    const previous = countedTriangles(source);

    expect(exhaustiveFit({ ...face, tris: previous.tris }, 'A')).toEqual(fitLabel(face, 'A'));
    expect(previous.reads()).toBeGreaterThan(count * 50);
    expect(source).toEqual(fanTriangles(count));
  });
});
