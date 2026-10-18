import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { buildPrintReport } from './printReport';

const box = (id: string, size: [number, number, number]): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: size[0], height: size[1], depth: size[2] },
  color: '#888',
  note: '',
  visible: true,
  locked: false,
});

const triangles = (part: ScenePart) => {
  const { width, height, depth } = part.dimensions;

  return new THREE.BoxGeometry(width, height, depth).toNonIndexed().getAttribute('position').array as Float32Array;
};

describe('buildPrintReport', () => {
  const parts = [box('small', [20, 20, 20]), box('huge', [400, 30, 30])];
  const report = buildPrintReport(parts, DEFAULT_PROJECT, (id) => triangles(parts.find((p) => p.id === id)!));

  it('reports every printed part with grams and time', () => {
    const small = report.parts.find((r) => r.id === 'small')!;

    expect(small.check.fits).toBe(true);
    expect(small.grams).toBeGreaterThan(0);
    expect(small.hours).toBeGreaterThan(0);
    expect(small.plate).toBe(1);
  });

  it('flags a part too big for the plate first, and leaves it off the plates', () => {
    expect(report.parts[0].id).toBe('huge');
    expect(report.parts[0].issues[0]).toMatch(/larger than the P1S plate/);
    expect(report.parts[0].plate).toBe(0);
    expect(report.totals.failing).toBe(1);
    expect(report.plates.PLA).toBe(1);
  });
});
