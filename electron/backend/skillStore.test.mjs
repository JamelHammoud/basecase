import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BasecaseBackendService } from '../backend-service.mjs';
import { Trainer } from '../trainer.mjs';
import { getKeptSnapshot, getSkill, keepSnapshots, saveSkill } from './skillStore.mjs';

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

describe('snapshots kept with a skill', () => {
  const RUN = 'policy-abc-1';

  function jobs() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'training-'));

    fs.mkdirSync(path.join(dir, RUN, 'snapshots'), { recursive: true });
    [10, 20].forEach((iteration) =>
      fs.writeFileSync(path.join(dir, RUN, 'snapshots', `${iteration}.json`), JSON.stringify({ iteration })),
    );

    return dir;
  }

  it('copies the snapshots that still exist into the skill folder', () => {
    const dir = library();
    const snapshots = [
      { run: RUN, iteration: 10, steps: 100 },
      { run: RUN, iteration: 15, steps: 150 },
      { run: RUN, iteration: 20, steps: 200 },
    ];
    const kept = keepSnapshots(dir, jobs(), { hash: HASH, snapshots });

    expect(kept).toEqual([snapshots[0], snapshots[2]]);
    expect(fs.readdirSync(path.join(dir, 'skills', HASH, 'snapshots')).sort()).toEqual([
      `${RUN}-10.json`,
      `${RUN}-20.json`,
    ]);
    expect(getKeptSnapshot(dir, { skill: HASH, run: RUN, iteration: 20 })).toEqual({ iteration: 20 });
    expect(getKeptSnapshot(dir, { skill: HASH, run: RUN, iteration: 15 })).toBeNull();
  });

  it('refuses a bad hash, a run that is a path, or too many snapshots', () => {
    const dir = library();
    const from = jobs();
    const ref = { run: RUN, iteration: 10, steps: 100 };

    expect(() => keepSnapshots(dir, from, { hash: '../../evil', snapshots: [ref] })).toThrow(/hash/);
    expect(() => keepSnapshots(dir, from, { hash: HASH, snapshots: [{ ...ref, run: '../policy-x' }] })).toThrow(/run/);
    expect(() => keepSnapshots(dir, from, { hash: HASH, snapshots: [{ ...ref, iteration: '../10' }] })).toThrow(
      /iteration/,
    );
    expect(() => keepSnapshots(dir, from, { hash: HASH, snapshots: Array(13).fill(ref) })).toThrow(/12/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('reads nothing for a kept snapshot named outside the store', () => {
    const dir = library();

    keepSnapshots(dir, jobs(), { hash: HASH, snapshots: [{ run: RUN, iteration: 10, steps: 100 }] });

    for (const ref of [
      { skill: '../..', run: RUN, iteration: 10 },
      { skill: HASH, run: '..', iteration: 10 },
      { skill: HASH, run: RUN, iteration: '10' },
      { skill: HASH, run: RUN, iteration: -10 },
    ]) {
      expect(getKeptSnapshot(dir, ref)).toBeNull();
    }
  });

  it('reads a live snapshot from its run, and a kept one from its skill', () => {
    const dir = library();
    const trainer = new Trainer(
      dir,
      () => {},
      () => null,
      null,
    );
    const backend = { trainer, libraryDir: dir };
    const getSnapshot = (ref) => BasecaseBackendService.prototype.getSnapshot.call(backend, ref);
    const keep = (payload) => BasecaseBackendService.prototype.keepSnapshots.call(backend, payload);

    fs.cpSync(jobs(), trainer.jobsDir, { recursive: true });
    expect(keep({ hash: HASH, snapshots: [{ run: RUN, iteration: 10, steps: 100 }] })).toHaveLength(1);
    fs.rmSync(trainer.jobsDir, { recursive: true });
    fs.mkdirSync(path.join(trainer.jobsDir, RUN, 'snapshots'), { recursive: true });
    fs.writeFileSync(path.join(trainer.jobsDir, RUN, 'snapshots', '10.json'), '{"live":true}');

    expect(getSnapshot({ run: RUN, iteration: 10 })).toEqual({ live: true });
    expect(getSnapshot({ run: RUN, iteration: 10, skill: HASH })).toEqual({ iteration: 10 });
    expect(getSnapshot({ run: RUN, iteration: 10, skill: '../..' })).toBeNull();
  });
});
