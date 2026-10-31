import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSlicerApp } from './slicers.mjs';

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
