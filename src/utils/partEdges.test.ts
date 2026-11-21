import { describe, expect, it, vi } from 'vitest';
import type { PartDimensions, PartEdges } from '../types/robotics';
import { prismTriangles } from '../three/partMesh/edgedGeometry';
import { edgeLimitMm, hexOutline, type Outline } from './partEdges';

function formerOutline({ width, depth }: PartDimensions): Outline {
  return Array.from({ length: 6 }, (_, k) => {
    const theta = (k * Math.PI) / 3;

    return [(width / 2) * Math.sin(theta), (depth / 2) * Math.cos(theta)];
  });
}

function formerLimit(dimensions: PartDimensions): number {
  const outline = formerOutline(dimensions);
  const inradius = Math.min(
    ...outline.map(([ax, az], i) => {
      const [bx, bz] = outline[(i + 1) % outline.length];

      return Math.abs(ax * bz - bx * az) / Math.hypot(bx - ax, bz - az);
    }),
  );

  return Math.max(0, Math.min(inradius, dimensions.height / 2) * 0.98);
}

const SIZES: PartDimensions[] = [
  { width: 30, height: 16, depth: 30 },
  { width: 12.345, height: 70, depth: 92.125 },
  { width: 90, height: 0.001, depth: 0.0001 },
  { width: 1e6, height: 1e4, depth: 1e5 },
];

describe('hexagonal outlines', () => {
  it('preserves exact outlines and edge limits through dimension edits', () => {
    const exceptional = [0, -0, -12, Infinity, NaN].map((width) => ({ width, height: 8, depth: 19 }));

    for (const dimensions of [...SIZES, ...exceptional]) {
      expect(hexOutline(dimensions)).toEqual(formerOutline(dimensions));
      expect(edgeLimitMm('hex_prism', dimensions)).toBe(formerLimit(dimensions));
    }

    const changed = hexOutline(SIZES[0]);

    changed[0][0] = 123;
    changed.pop();
    expect(hexOutline(SIZES[0])).toEqual(formerOutline(SIZES[0]));
  });

  it.each<PartEdges['kind']>(['fillet', 'chamfer'])('preserves complete %s triangle output', (kind) => {
    for (const dimensions of SIZES) {
      const edges = { kind, mm: Math.min(0.5, edgeLimitMm('hex_prism', dimensions) / 2) };

      for (const middle of [1, 16]) {
        expect(prismTriangles(hexOutline(dimensions), dimensions.height, edges, middle)).toEqual(
          prismTriangles(formerOutline(dimensions), dimensions.height, edges, middle),
        );
      }
    }
  });

  it('uses prepared directions for repeated outlines and edge limits', () => {
    const sin = vi.spyOn(Math, 'sin');
    const cos = vi.spyOn(Math, 'cos');

    try {
      for (let i = 0; i < 100; i++) {
        const dimensions = { width: 12 + i, height: 20, depth: 30 + i };

        hexOutline(dimensions);
        edgeLimitMm('hex_prism', dimensions);
      }

      expect(sin).not.toHaveBeenCalled();
      expect(cos).not.toHaveBeenCalled();
    } finally {
      sin.mockRestore();
      cos.mockRestore();
    }
  });
});
