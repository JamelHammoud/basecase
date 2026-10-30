import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterAll, describe, expect, it } from 'vitest';
import { printerModel } from '../../src/data/printers';
import { weld, writeThreeMf } from '../../src/print/threeMf';
import { Printing } from './index.mjs';
import { findSlicerApp } from './slicers.mjs';

const box = (w, h, d) => weld(new THREE.BoxGeometry(w, h, d).toNonIndexed().attributes.position.array);
const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z).elements;
const library = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-print-'));

afterAll(() => fs.rmSync(library, { recursive: true, force: true }));

describe.skipIf(!findSlicerApp('bambu'))('slicing with Bambu Studio', () => {
  const model = printerModel('bambu-lab-p1s');
  const printing = new Printing({ libraryDir: library, emit: () => {}, secrets: null });
  const layoutOf = (object, matrix) =>
    writeThreeMf({
      layout: 'grid',
      plateSize: [256, 256],
      plates: [{ number: 1, name: 'Plate 1' }],
      objects: [object],
      items: [{ objectId: object.id, matrix, plate: 1 }],
    });
  const payload = {
    jobId: 'test-scene',
    name: 'Test robot',
    groups: [
      {
        material: 'PLA',
        bytes: layoutOf({ id: 1, name: 'bracket', mesh: box(20, 20, 20) }, at(60, 60, 10)),
        plates: [{ number: 1, local: 1, hash: 'a' }],
      },
      {
        material: 'TPU',
        bytes: layoutOf({ id: 1, name: 'foot', mesh: box(40, 30, 10) }, at(128, 128, 5)),
        plates: [{ number: 2, local: 1, hash: 'b' }],
      },
    ],
    printer: {
      vendor: model.vendor,
      machine: model.presets.machine,
      process: model.presets.process,
      filaments: { PLA: model.presets.filaments.PLA.name, TPU: model.presets.filaments.TPU.name },
      bedType: model.bedType,
    },
    infillPct: 25,
  };

  it('slices each material’s plates with its own filament, plate type and infill', async () => {
    const record = await printing.slice(payload);

    expect(record.plates.map((p) => [p.number, p.material])).toEqual([
      [1, 'PLA'],
      [2, 'TPU'],
    ]);
    expect(record.plates.every((p) => p.seconds > 0 && p.grams > 0)).toBe(true);
    expect(record.plates[0].thumbnail).toMatch(/^data:image\/png/);

    const pla = unzipSync(fs.readFileSync(record.files.PLA));
    const settings = JSON.parse(strFromU8(pla['Metadata/project_settings.config']));
    const tpu = strFromU8(unzipSync(fs.readFileSync(record.files.TPU))['Metadata/slice_info.config']);

    expect(settings.curr_bed_type).toBe('Textured PEI Plate');
    expect(settings.sparse_infill_density).toBe('25%');
    expect(tpu).toMatch(/type="TPU"/);
  }, 60000);

  it('returns the cached result when nothing changed', async () => {
    expect((await printing.slice(payload)).cached).toBe(true);
  });

  it('finds a plate’s G-code for printers that take plain G-code', async () => {
    const { slicedPlate } = await import('./jobs.mjs');
    const { extractPlateGcode } = await import('./slice.mjs');
    const dir = path.join(library, 'prints', 'test-scene');
    const { file, local } = slicedPlate(dir, 2);
    const out = extractPlateGcode(file, local, path.join(dir, 'plate-2.gcode'));

    expect(fs.readFileSync(out, 'utf8')).toMatch(/G1/);
  });
});
