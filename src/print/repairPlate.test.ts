import * as THREE from 'three';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { resolvePrinter } from '../data/printers';
import { printReportsIn, threeMfIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { printReportOf } from '../utils/printReport';
import { printScopeParts, repairPrintParts } from './repairPlate';
import { jobSpec } from './job';

const part = (id: string): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 20, depth: 20 },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
});

describe('a plate scoped to a replacement', () => {
  it('runs one copy through the real print worker and packer regardless of saved print settings', async () => {
    const target = {
      ...part('leg'),
      print: {
        copies: 4,
        skip: true,
        plate: 7,
        at: [900, 900] as [number, number],
        down: [0, 1, 0] as [number, number, number],
      },
    };
    const scene = [target, part('base')];
    const original = structuredClone(scene);
    const scoped = printScopeParts(scene, [], { repairId: target.id, skipPrinted: true });
    const shapes = snapshotShapes(
      scene.map((p) => ({ id: p.id, object: new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20)) })),
    );
    const report = await printReportOf(
      scoped,
      { project: DEFAULT_PROJECT, printer: resolvePrinter('bambu-p1s', []), scene },
      (ids, faces) =>
        printReportsIn(
          snapshotShapes(
            scene
              .filter((p) => ids.includes(p.id))
              .map((p) => ({
                id: p.id,
                object: new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20)),
              })),
          ),
          faces,
        ),
    );

    expect(report.parts.map((p) => [p.id, p.copies])).toEqual([['leg', 1]]);
    expect(report.plan.plates).toHaveLength(1);
    expect(report.plan.plates[0].items.map((p) => p.id)).toEqual(['leg']);
    expect(report.parts[0].check.pose.down).toEqual(target.print.down);
    expect(scene).toEqual(original);

    const spec = jobSpec(report.plan, report.printer, DEFAULT_PROJECT);
    const written = await threeMfIn(shapes, { files: spec.files, plateSize: spec.plateSize });
    const model = strFromU8(unzipSync(written.files.PLA)['3D/3dmodel.model']);

    expect(model.match(/<object /g)).toHaveLength(1);
    expect(model.match(/<item /g)).toHaveLength(1);
    expect(model).toContain('name="leg"');
    expect(model).not.toContain('name="base"');
  });

  it('does not substitute another part when the requested part is absent or bought', () => {
    const screw = {
      ...part('screw'),
      kind: 'hardware',
      hardware: { type: 'socket_head', size: 'M3', length: 8 },
    } as ScenePart;

    expect(repairPrintParts([part('leg')], 'missing')).toEqual([]);
    expect(repairPrintParts([screw, part('leg')], screw.id)).toEqual([]);
  });

  it('applies temporary print edits while keeping one copy on the first plate and the source untouched', async () => {
    const source = { ...part('leg'), print: { down: [0, 1, 0] as [number, number, number], copies: 3, skip: true } };
    const original = structuredClone(source);
    const [scoped] = printScopeParts([source], [], {
      repairId: 'leg',
      skipPrinted: true,
      repairPrint: { down: [1, 0, 0], at: [30, 40], turned: true, copies: 8, skip: true, plate: 7 },
    });

    expect(scoped.print).toEqual({
      down: [1, 0, 0],
      noLabel: undefined,
      at: [30, 40],
      turned: true,
      copies: 1,
      skip: false,
      plate: 1,
    });
    expect(source).toEqual(original);

    const report = await printReportOf(
      [scoped],
      { project: DEFAULT_PROJECT, printer: resolvePrinter('bambu-p1s', []), scene: [source] },
      (_, faces) =>
        printReportsIn(
          snapshotShapes([{ id: source.id, object: new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20)) }]),
          faces,
        ),
    );

    expect(report.plan.plates[0].items[0]).toMatchObject({ id: 'leg', x: 30, y: 40, yaw: 90 });
    expect(report.parts[0].check.pose.down).toEqual([1, 0, 0]);
    expect(source).toEqual(original);
  });
});
