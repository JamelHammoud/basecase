import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exeName, findOnPath, splitCommand } from './executables.mjs';
import { isSafeFileId, safeFileId } from './backend/constants.mjs';

describe('splitCommand', () => {
  it('keeps quoted paths with spaces whole', () => {
    expect(splitCommand('"C:\\Program Files\\nodejs\\node.exe" agent.js --acp')).toEqual([
      'C:\\Program Files\\nodejs\\node.exe',
      'agent.js',
      '--acp',
    ]);
    expect(splitCommand("node '/Users/First Last/agent.js'")).toEqual(['node', '/Users/First Last/agent.js']);
    expect(splitCommand('  node  a.js ')).toEqual(['node', 'a.js']);
  });
});

describe('findOnPath', () => {
  it('looks for .exe on Windows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-path-'));

    fs.writeFileSync(path.join(dir, 'uv.exe'), '');
    fs.chmodSync(path.join(dir, 'uv.exe'), 0o700);

    expect(exeName('uv', 'win32')).toBe('uv.exe');
    expect(findOnPath('uv', dir, 'win32')).toBe(path.join(dir, 'uv.exe'));
    expect(findOnPath('uv', dir, 'linux')).toBeNull();
  });
});

describe('file ids', () => {
  it('refuses names Windows keeps for devices', () => {
    for (const id of ['con', 'NUL', 'com1', 'Lpt9']) expect(isSafeFileId(id)).toBe(false);

    expect(isSafeFileId('console')).toBe(true);
    expect(safeFileId('nul')).toBe('_nul');
  });
});
