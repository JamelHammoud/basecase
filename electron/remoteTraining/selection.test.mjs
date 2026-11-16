import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recordSeedSelection } from './selection.mjs';

const dirs = [];

afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-selection-'));
  const parent = path.join(dir, 'policy-parent');
  const children = [0, 1].map((index) => ({
    id: `policy-child-${index}`,
    seed: index + 1,
    steps: 12,
    descriptor: { inputHashes: { 'model.xml': 'a'.repeat(64) } },
    outcome: { kind: 'done' },
  }));

  dirs.push(dir);
  fs.mkdirSync(parent);
  fs.writeFileSync(path.join(parent, 'remote-request.json'), JSON.stringify({ children, outcome: { kind: 'done' } }));

  const selection = {
    evaluation: 'nominal-contract-v1',
    selected: children[0].id,
    attempts: children.map((child) => ({
      id: child.id,
      seed: child.seed,
      steps: child.steps,
      fingerprint: child.descriptor.inputHashes,
      development: { kind: 'nominal-contract-v1', score: 1 },
    })),
  };

  return { dir, parent, selection };
}

describe('selection recorded in the existing remote workflow journal', () => {
  it('persists local selection before Arena and accepts only an identical replay', () => {
    const { dir, parent, selection } = fixture();

    expect(recordSeedSelection(dir, selection)).toBe(true);
    expect(recordSeedSelection(dir, selection)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(parent, 'remote-request.json'), 'utf8')).selection).toEqual(selection);
    expect(() => recordSeedSelection(dir, { ...selection, selected: 'policy-child-1' })).toThrow('selection changed');
  });

  it('refuses escaped identities, duplicate children, changed fingerprints and remote readiness labels', () => {
    const { dir, selection } = fixture();
    const altered = structuredClone(selection);

    altered.attempts[0].fingerprint['model.xml'] = 'b'.repeat(64);
    expect(() => recordSeedSelection(dir, altered)).toThrow();
    expect(() => recordSeedSelection(dir, { ...selection, selected: '../policy-child-0' })).toThrow();
    expect(() =>
      recordSeedSelection(dir, { ...selection, attempts: [selection.attempts[0], selection.attempts[0]] }),
    ).toThrow();
    expect(() => recordSeedSelection(dir, { ...selection, evaluation: 'Arena-ready' })).toThrow();
  });
});
