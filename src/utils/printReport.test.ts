import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { customModel, printerModel, resolvePrinter, type PrinterSetup } from '../data/printers';
import { bedOf } from '../print/bed';
import { printReportsIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { printReportOf, type PrintReport } from './printReport';

const box = (id: string, size: [number, number, number], extra: Partial<ScenePart> = {}): ScenePart => ({
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
  ...extra,
});

const meshOf = (part: ScenePart) => {
  const { width, height, depth } = part.dimensions;

  return { id: part.id, object: new THREE.Mesh(new THREE.BoxGeometry(width, height, depth)) };
};

const reportFor = (parts: ScenePart[], printer: PrinterSetup) =>
  printReportOf(parts, { project: DEFAULT_PROJECT, printer }, (ids, faces) =>
    printReportsIn(snapshotShapes(parts.filter((p) => ids.includes(p.id)).map(meshOf)), faces),
  );

const setupOf = (id: string): PrinterSetup => resolvePrinter(id, []);

const insideBed = (report: PrintReport) => {
  const bed = report.plan.bed;

  return report.plan.plates.every((plate) =>
    plate.items.every((it) => {
      const corners = [
        [it.x, it.y],
        [it.x + it.w, it.y + it.d],
      ];
      const inBed = corners.every(
        ([x, y]) => x >= -1e-6 && y >= -1e-6 && x <= bed.width + 1e-6 && y <= bed.depth + 1e-6,
      );
      const clearOfKeepOut = bed.keepOut.every(
        (k) => it.x >= k.x + k.w || it.x + it.w <= k.x || it.y >= k.y + k.d || it.y + it.d <= k.y,
      );

      return inBed && clearOfKeepOut;
    }),
  );
};

describe('print report on a Bambu Lab P1S', () => {
  const parts = [
    box('small', [20, 20, 20]),
    box('huge', [400, 30, 30]),
    ...Array.from({ length: 12 }, (_, i) => box(`plate-${i}`, [70, 8, 110])),
  ];
  let report: PrintReport;

  beforeAll(async () => {
    report = await reportFor(parts, setupOf('bambu-p1s'));
  });

  it('reads the P1S bed and keep-out from the catalog', () => {
    const bed = bedOf(printerModel('bambu-lab-p1s')!);

    expect([bed.width, bed.depth, bed.height]).toEqual([256, 256, 250]);
    expect(bed.keepOut).toEqual([{ x: 0, y: 0, w: 18, d: 28 }]);
  });

  it('reports every printed part with grams, time and a plate', () => {
    const small = report.parts.find((r) => r.id === 'small')!;

    expect(small.check.fits).toBe(true);
    expect(small.grams).toBeGreaterThan(0);
    expect(small.hours).toBeGreaterThan(0);
    expect(small.plate).toBeGreaterThan(0);
  });

  it('flags a part too big for the plate first, and leaves it off the plates', () => {
    expect(report.parts[0].id).toBe('huge');
    expect(report.parts[0].issues[0]).toMatch(/larger than the Bambu Lab P1S plate \(256 × 256 × 250 mm\)/);
    expect(report.parts[0].plate).toBe(0);
    expect(report.totals.failing).toBe(1);
  });

  it('lays flat plates down and packs every part inside the bed, clear of the keep-out', () => {
    const flat = report.parts.find((r) => r.id === 'plate-0')!;

    expect(flat.check.size[2]).toBeCloseTo(8, 0);
    expect(insideBed(report)).toBe(true);
    expect(report.plan.plates.length).toBeGreaterThan(0);
  });

  it('gives the same layout for the same scene', async () => {
    const again = await reportFor(parts, setupOf('bambu-p1s'));

    expect(again.plan.plates.map((p) => p.hash)).toEqual(report.plan.plates.map((p) => p.hash));
  });
});

describe('print report on other printers', () => {
  it('uses a Prusa MINI’s 180 mm bed', async () => {
    const report = await reportFor([box('wide', [200, 10, 40])], setupOf('prusa-mini'));

    expect(report.parts[0].check.fits).toBe(true);
    expect(report.parts[0].check.yaw! % 90).not.toBe(0);
    expect(report.parts[0].issues).toEqual([]);
  });

  it('respects a custom bed', async () => {
    const custom = { ...setupOf('bambu-lab-p1s'), model: customModel({ width: 120, depth: 120, height: 100 }) };
    const report = await reportFor([box('tall', [50, 150, 50])], custom);

    expect(report.parts[0].check.size[2]).toBeLessThanOrEqual(100);
    expect(insideBed(report)).toBe(true);
  });

  it('prints extra copies of a part', async () => {
    const report = await reportFor([box('foot', [40, 10, 40], { print: { copies: 3 } })], setupOf('bambu-lab-p1s'));

    expect(report.plan.plates.flatMap((p) => p.items)).toHaveLength(3);
    expect(insideBed(report)).toBe(true);
  });

  it('honours a face the user picked', async () => {
    const report = await reportFor(
      [box('bracket', [60, 10, 30], { print: { down: [0, 0, 1] } })],
      setupOf('bambu-lab-p1s'),
    );

    expect(report.parts[0].check.pose.down).toEqual([0, 0, 1]);
    expect(report.parts[0].check.size[2]).toBeCloseTo(30, 0);
  });
});
