import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildCatalog } from './catalog.mjs';
import { matchesCondition } from './condition.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-profiles-'));

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const square = (w, d) => ['0x0', `${w}x0`, `${w}x${d}`, `0x${d}`];

function writeTree(slicer, vendors) {
  const profiles = path.join(root, slicer);

  for (const [vendor, kinds] of Object.entries(vendors)) {
    fs.mkdirSync(path.join(profiles, vendor), { recursive: true });
    fs.writeFileSync(path.join(profiles, `${vendor}.json`), JSON.stringify({ name: vendor }));

    for (const [kind, presets] of Object.entries(kinds)) {
      for (const preset of presets) {
        const file = path.join(profiles, vendor, kind, preset.folder ?? '', `${preset.name}.json`);

        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ ...preset, folder: undefined }));
      }
    }
  }

  return profiles;
}

const model = (name, nozzles = '0.4') => ({ type: 'machine_model', name, nozzle_diameter: nozzles });

const machine = (name, printerModel, extra = {}) => ({
  type: 'machine',
  name: `${name} 0.4 nozzle`,
  printer_model: printerModel,
  instantiation: 'true',
  ...extra,
});

const bambuProfiles = writeTree('bambu', {
  Acme: {
    machine: [
      model('Acme One'),
      { type: 'machine', name: 'fdm_acme_common', instantiation: 'false', printable_height: '200' },
      machine('Acme One', 'Acme One', {
        inherits: 'fdm_acme_common',
        printable_area: square(220, 220),
        default_print_profile: '0.20mm Standard @Acme',
      }),
    ],
    process: [{ type: 'process', name: '0.20mm Standard @Acme', layer_height: '0.2', instantiation: 'true' }],
    filament: [{ type: 'filament', name: 'Generic PLA @Acme', filament_type: ['PLA'], instantiation: 'true' }],
  },
});

const orcaProfiles = writeTree('orca', {
  Acme: {
    machine: [
      model('Acme One'),
      model('Acme Two', '0.4;0.6'),
      model('Acme Two 5T'),
      {
        type: 'machine',
        name: 'fdm_machine_common',
        folder: 'base',
        instantiation: 'false',
        printable_area: square(250, 210),
        printable_height: '220',
        printer_notes: 'PRINTER_MODEL_TWO',
      },
      machine('Acme One', 'Acme One', { printable_area: square(999, 999), printable_height: '999' }),
      machine('Acme Two', 'Acme Two', {
        inherits: 'fdm_machine_common',
        nozzle_diameter: ['0.4'],
        default_print_profile: '0.20mm SPEED @Two',
      }),
      machine('Acme Two 5T', 'Acme Two 5T', { inherits: 'fdm_machine_common', nozzle_diameter: ['0.4', '0.4'] }),
    ],
    process: [
      { type: 'process', name: 'process_common', instantiation: 'false', layer_height: '0.2' },
      {
        type: 'process',
        name: '0.20mm SPEED @Two',
        inherits: 'process_common',
        instantiation: 'true',
        compatible_printers_condition: 'printer_notes=~/.*PRINTER_MODEL_TWO.*/ and nozzle_diameter[0]==0.4',
      },
      {
        type: 'process',
        name: '0.15mm SPEED @Two 0.6',
        layer_height: '0.15',
        instantiation: 'true',
        compatible_printers_condition: 'printer_notes=~/.*PRINTER_MODEL_TWO.*/ and nozzle_diameter[0]==0.6',
      },
    ],
    filament: [
      { type: 'filament', name: 'fdm_filament_flex', instantiation: 'false', filament_type: ['FLEX'] },
      {
        type: 'filament',
        name: 'Generic FLEX @Acme Two',
        inherits: 'fdm_filament_flex',
        instantiation: 'true',
        compatible_printers: ['Acme Two 0.4 nozzle'],
      },
      {
        type: 'filament',
        name: 'Generic PETG @Acme Other',
        filament_type: ['PETG'],
        instantiation: 'true',
        compatible_printers: ['Acme Other 0.4 nozzle'],
      },
    ],
  },
  Other: { machine: [model('Other One'), machine('Other One', 'Other One', { printable_area: square(100, 100) })] },
});

const catalog = () =>
  buildCatalog([
    { slicer: 'bambu', version: '02.09.01.70', profiles: bambuProfiles },
    { slicer: 'orca', version: '2.5.0', profiles: orcaProfiles, makers: ['Acme'] },
  ]);

describe('buildCatalog', () => {
  it('takes a printer both slicers have from Bambu Studio', () => {
    const one = catalog().find((m) => m.id === 'acme-one');

    expect(one.source).toEqual({ slicer: 'bambu', version: '02.09.01.70' });
    expect(one.bed).toEqual([
      [0, 0],
      [220, 0],
      [220, 220],
      [0, 220],
    ]);
    expect(one.height).toBe(200);
  });

  it('adds OrcaSlicer printers with machine, process and filament inheritance resolved', () => {
    const two = catalog().find((m) => m.id === 'acme-two');

    expect(two.source).toEqual({ slicer: 'orca', version: '2.5.0' });
    expect(two.bed[2]).toEqual([250, 210]);
    expect(two.height).toBe(220);
    expect(two.nozzles).toEqual([0.4, 0.6]);
    expect(two.presets).toEqual({
      machine: 'Acme Two 0.4 nozzle',
      process: '0.20mm SPEED @Two',
      processes: [{ name: '0.20mm SPEED @Two', layer: 0.2 }],
      filaments: { TPU: { name: 'Generic FLEX @Acme Two', density: undefined } },
    });
  });

  it('leaves out multi-tool printers and makers it wasn’t asked for', () => {
    expect(catalog().map((m) => m.id)).toEqual(['acme-one', 'acme-two']);
  });
});

describe('matchesCondition', () => {
  const notes = { printer_notes: 'Keywords\nPRINTER_MODEL_COREONE\nPG', nozzle_diameter: ['0.4'], single: '1' };

  it('matches regexes across lines, indexed numbers and flags', () => {
    expect(matchesCondition('printer_notes=~/.*PRINTER_MODEL_COREONE[^_a-zA-Z0-9].*/', notes)).toBe(true);
    expect(matchesCondition('printer_notes!~/.*HF_NOZZLE.*/ and nozzle_diameter[0]==0.4', notes)).toBe(true);
    expect(matchesCondition('nozzle_diameter[0]==0.6 or single', notes)).toBe(true);
    expect(matchesCondition('nozzle_diameter[0]==0.6 or !single', notes)).toBe(false);
    expect(matchesCondition('printer_notes=~/.*PRINTER_MODEL_COREONE_L.*/', notes)).toBe(false);
  });

  it('treats an empty condition as compatible', () => {
    expect(matchesCondition('', notes)).toBe(true);
    expect(matchesCondition(undefined, notes)).toBe(true);
  });
});
