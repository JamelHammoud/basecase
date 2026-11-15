import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it, vi } from 'vitest';
import { threeMfIn } from '../three/analysis/analysisPool';
import { DEFAULT_PROJECT } from '../types/robotics';
import { jobSpec } from './job';
import { projectJobSpec } from './projectJob';
import { buildPrintPlan } from './plan';
import { planInput } from './plan.fixtures';
import { projectPrinter, roverParts, roverPlan, roverShapes } from './project.fixtures';
import { weld, writeThreeMf } from './threeMf';

async function archive(plan = roverPlan(), trays?: Array<{ slot: number; type: string; color: string }>) {
  const spec = projectJobSpec(plan, projectPrinter, DEFAULT_PROJECT, trays);
  const written = await threeMfIn(roverShapes(), spec);
  const bytes = written.files[spec.files[0].key];
  const files = unzipSync(bytes);

  return {
    spec,
    bytes,
    settings: JSON.parse(strFromU8(files['Metadata/project_settings.config'])),
    config: strFromU8(files['Metadata/model_settings.config']),
    model: strFromU8(files['3D/3dmodel.model']),
  };
}

describe('a multi-material robot project', () => {
  it('writes both materials, per-object filaments, copies and packed transforms in the analysis worker', async () => {
    const { settings, config, model } = await archive();

    expect(settings.filament_type).toEqual(['PLA', 'TPU']);
    expect(settings.filament_colour).toHaveLength(2);
    expect(settings.filament_settings_id).toEqual([
      projectPrinter.model.presets!.filaments.PLA!.name,
      projectPrinter.model.presets!.filaments.TPU!.name,
    ]);
    expect(config.match(/<object /g)).toHaveLength(5);
    expect(config).toMatch(/<object id="1">[^]*?key="extruder" value="1"/);
    expect(config.match(/key="extruder" value="2"/g)).toHaveLength(4);
    expect(config.match(/<model_instance>/g)).toHaveLength(5);
    expect(model.match(/<item /g)).toHaveLength(5);
    expect(model).toContain('name="Rover tire (4)"');

    const transform = model
      .match(/<item objectid="1" transform="([^"]+)"/)![1]
      .split(' ')
      .map(Number);
    const matrix = roverPlan().plates[0].items[0].matrix;

    expect(transform).toEqual(
      [
        matrix[0],
        matrix[1],
        matrix[2],
        matrix[4],
        matrix[5],
        matrix[6],
        matrix[8],
        matrix[9],
        matrix[10],
        matrix[12],
        matrix[13],
        matrix[14],
      ].map((v) => v || 0),
    );
    expect(settings.printer_settings_id).toBe(projectPrinter.model.presets!.machine);
  });

  it('keeps four hexapod plates and global plate membership across materials', async () => {
    const inputs = [
      planInput('body', [180, 180, 20]),
      ...Array.from({ length: 6 }, (_, i) => planInput(`leg-${i}`, [90, 100, 20])),
      ...Array.from({ length: 6 }, (_, i) => planInput(`foot-${i}`, [30, 30, 20], { material: 'TPU' })),
    ];
    const plan = buildPrintPlan(inputs, projectPrinter, roverPlan().bed, '');
    const spec = projectJobSpec(plan, projectPrinter, DEFAULT_PROJECT);
    const shapes = roverShapes(
      inputs.map((p) => ({
        ...roverParts()[0],
        id: p.id,
        dimensions: { width: p.check.size[0], height: p.check.size[2], depth: p.check.size[1] },
      })),
    );
    const written = await threeMfIn(shapes, spec);
    const files = unzipSync(written.files.PLA);
    const config = strFromU8(files['Metadata/model_settings.config']);
    const model = strFromU8(files['3D/3dmodel.model']);

    expect(plan.plates).toHaveLength(4);
    expect([...config.matchAll(/key="plater_id" value="(\d+)"/g)].map((m) => m[1])).toEqual(['1', '2', '3', '4']);
    expect(config.match(/<model_instance>/g)).toHaveLength(13);
    expect(model.match(/<item /g)).toHaveLength(13);
    expect(spec.files[0].items.map((it) => it.plate)).toEqual(plan.plates.flatMap((p) => p.items.map(() => p.number)));
  });

  it('orders matching loaded AMS slots by slot and appends unloaded materials', async () => {
    const { settings, config } = await archive(roverPlan(), [
      { slot: 3, type: 'PLA', color: 'ABCDEFff' },
      { slot: 0, type: 'TPU', color: '123456FF' },
      { slot: 254, type: 'PLA', color: 'FFFFFF' },
    ]);

    expect(settings.filament_type).toEqual(['TPU', 'PLA']);
    expect(settings.filament_colour).toEqual(['#123456', '#ABCDEF']);
    expect(config).toMatch(/<object id="1">[^]*?key="extruder" value="2"/);
    expect((await archive(roverPlan(), [{ slot: 0, type: 'TPU', color: '123456FF' }])).settings.filament_type).toEqual([
      'TPU',
      'PLA',
    ]);
  });
});

describe('project print scope and stable archives', () => {
  it('keeps tracker-skipped parts out even when their geometry is in the worker snapshot', async () => {
    const { splitPrinted, printRecordFor } = await import('./tracker');
    const { shapeKey } = await import('./shapeKey');
    const parts = [...roverParts(), { ...roverParts()[0], id: 'spare', name: 'Printed spare' }];
    const printedPlate = { ...roverPlan().plates[0], items: [{ ...roverPlan().plates[0].items[0], id: 'spare' }] };
    const record = {
      ...printRecordFor(printedPlate, { parts, keyOf: shapeKey, printer: 'P1S', now: new Date(0) }),
      state: 'printed' as const,
    };
    const remaining = splitPrinted(parts, [record], shapeKey).remaining;
    const plan = buildPrintPlan(
      remaining.map((p) => planInput(p.id, [20, 20, 20], { material: p.printMaterial })),
      projectPrinter,
      roverPlan().bed,
      '',
    );
    const spec = projectJobSpec(plan, projectPrinter, DEFAULT_PROJECT);
    const written = await threeMfIn(roverShapes(parts), spec);
    const files = unzipSync(written.files.PLA);
    const model = strFromU8(files['3D/3dmodel.model']);

    expect(model).toContain('name="body"');
    expect(model).toContain('name="tire"');
    expect(model).not.toContain('spare');
    expect(files['Metadata/project_settings.config']).toBeDefined();
  });

  it('leaves a single material on the existing plate writer path', () => {
    const plan = roverPlan();

    plan.plates = plan.plates.filter((p) => p.material === 'PLA');
    expect(projectJobSpec(plan, projectPrinter, DEFAULT_PROJECT)).toEqual(
      jobSpec(plan, projectPrinter, DEFAULT_PROJECT),
    );
  });

  it('writes the same project bytes on different days', async () => {
    const first = await archive();

    expect((await archive()).bytes).toEqual(first.bytes);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-02T03:04:05Z'));

    try {
      const spec = first.spec.files[0];
      const mesh = weld(new THREE.BoxGeometry(20, 20, 20).toNonIndexed().attributes.position.array as Float32Array);
      const input = {
        layout: 'grid' as const,
        plateSize: first.spec.plateSize,
        plates: spec.plates,
        project: spec.project,
        objects: spec.items.map((it, i) => ({ id: i + 1, name: it.name, mesh, filament: it.filament })),
        items: spec.items.map((it, i) => ({ objectId: i + 1, matrix: it.matrix, plate: it.plate })),
      };
      const a = writeThreeMf(input);

      vi.setSystemTime(new Date('2031-12-03T04:05:06Z'));
      expect(writeThreeMf(input)).toEqual(a);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('legacy plate archives', () => {
  it('preserves the existing single-material archive bytes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1));

    try {
      const mesh = weld(new THREE.BoxGeometry(20, 20, 20).toNonIndexed().attributes.position.array as Float32Array);
      const bytes = writeThreeMf({
        layout: 'grid',
        plateSize: [256, 256],
        plates: [{ number: 1, name: 'Plate 1' }],
        objects: [{ id: 1, name: 'body', mesh }],
        items: [{ objectId: 1, matrix: new THREE.Matrix4().elements, plate: 1 }],
      });

      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        '90f4bf0235a1606c5a4aa7af5dfa149973a4baffd66d89ceb8b77e0949ea6aee',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
