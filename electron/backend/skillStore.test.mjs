import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSkill, saveSkill } from './skillStore.mjs';

const library = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));
const HASH = 'a'.repeat(64);
const skill = JSON.stringify({ format: 'basecase-skill', name: 'Stand' });

describe('the skill store', () => {
  it('saves a skill under its hash and reads it back', () => {
    const dir = library();

    expect(saveSkill(dir, { hash: HASH, text: skill })).toEqual({ ok: true });
    expect(getSkill(dir, HASH)).toEqual({ format: 'basecase-skill', name: 'Stand' });
    expect(getSkill(dir, 'b'.repeat(64))).toBeNull();
  });

  it('refuses names that aren’t a hash, so nothing lands outside the store', () => {
    const dir = library();

    for (const hash of ['../../evil', `${HASH}/../x`, 'A'.repeat(64), '', null]) {
      expect(() => saveSkill(dir, { hash, text: skill })).toThrow(/hash/);
      expect(() => getSkill(dir, hash)).toThrow(/hash/);
    }

    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses anything but a skill', () => {
    expect(() => saveSkill(library(), { hash: HASH, text: '{"format":"other"}' })).toThrow(/skill/);
    expect(() => saveSkill(library(), { hash: HASH, text: 'not json' })).toThrow();
  });
});
