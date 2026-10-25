import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { printReportsIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { printReportOf, type PrintReport } from './printReport';

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

const meshOf = (part: ScenePart) => {
  const { width, height, depth } = part.dimensions;

  return { id: part.id, object: new THREE.Mesh(new THREE.BoxGeometry(width, height, depth)) };
};

describe('buildPrintReport', () => {
  const parts = [box('small', [20, 20, 20]), box('huge', [400, 30, 30])];
  let report: PrintReport;

  beforeAll(async () => {
    report = await printReportOf(parts, DEFAULT_PROJECT, (ids) =>
      printReportsIn(snapshotShapes(parts.filter((p) => ids.includes(p.id)).map(meshOf))),
    );
  });

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
