import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePrinter } from '../../src/data/printers';
import { jobPrinter } from '../../src/print/job';
import { findSlicerApp, slicerFor } from './slicers.mjs';

describe('findSlicerApp on Windows', () => {
  it('finds Bambu Studio in Program Files', () => {
    const programFiles = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-pf-'));
    const folder = path.join(programFiles, 'Bambu Studio');

    fs.mkdirSync(path.join(folder, 'resources', 'profiles'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'bambu-studio.exe'), '');

    const app = findSlicerApp('bambu', { platform: 'win32', env: { ProgramFiles: programFiles } });

    expect(app).toMatchObject({
      kind: 'bambu',
      name: 'Bambu Studio',
      binary: path.join(folder, 'bambu-studio.exe'),
      profiles: path.join(folder, 'resources', 'profiles'),
    });
    expect(findSlicerApp('orca', { platform: 'win32', env: { ProgramFiles: programFiles } })).toBeNull();
  });
});

describe('slicerFor', () => {
  const installed = (...folders) => {
    const programFiles = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-pf-'));
    const exes = { 'Bambu Studio': 'bambu-studio.exe', OrcaSlicer: 'orca-slicer.exe' };

    for (const folder of folders) {
      fs.mkdirSync(path.join(programFiles, folder), { recursive: true });
      fs.writeFileSync(path.join(programFiles, folder, exes[folder]), '');
    }

    return { platform: 'win32', env: { ProgramFiles: programFiles } };
  };
  const printerFor = (id) => jobPrinter(resolvePrinter(id, []), {});

  it('picks OrcaSlicer for a Prusa printer from OrcaSlicer’s profiles, even with Bambu Studio installed', () => {
    const printer = printerFor('prusa-core-one');

    expect(printer.slicers).toEqual(['orca']);
    expect(slicerFor(printer, installed('Bambu Studio', 'OrcaSlicer'))?.kind).toBe('orca');
    expect(slicerFor(printer, installed('Bambu Studio'))).toBeNull();
  });

  it('picks Bambu Studio for a Bambu printer and falls back to OrcaSlicer', () => {
    const printer = printerFor('bambu-lab-p1s');

    expect(slicerFor(printer, installed('Bambu Studio', 'OrcaSlicer'))?.kind).toBe('bambu');
    expect(slicerFor(printer, installed('OrcaSlicer'))?.kind).toBe('orca');
  });

  it('opens the slicer asked for', () => {
    expect(slicerFor(printerFor('prusa-core-one'), { wanted: 'bambu', ...installed('Bambu Studio') })?.kind).toBe(
      'bambu',
    );
  });
});
