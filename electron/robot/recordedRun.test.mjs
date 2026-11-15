import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sessionSink, TryStore } from '../library/tryStore.mjs';
import { OperateRecorder } from './operateRecorder.mjs';
import { readRecordedRun } from './recordedRun.mjs';
import { fleetWithFake } from './robotLinkFake.mjs';

const folders = [];
const fleets = [];
const HASH = 'a'.repeat(64);

function rig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-run-'));
  const store = new TryStore({ triesDir: path.join(dir, 'tries'), cacheFile: path.join(dir, 'cache.json') });
  let now = 0;
  const recorder = new OperateRecorder({
    spec: { family: 'ros2', ids: [1] },
    sink: sessionSink(store),
    radians: (event) => event.q,
    clock: () => now,
    newId: () => 'run-1',
  });

  folders.push(dir);
  recorder.setContext({ sceneId: 'scene-1', robot: 'Arm', modelHash: HASH, joints: ['shoulder'] });

  return { store, recorder, tick: (ms) => (now = ms) };
}

afterEach(() => {
  for (const fleet of fleets.splice(0)) fleet.dispose();

  for (const dir of folders.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('latest recorded run', () => {
  it('flushes the current recording and reads only its last twenty seconds with matching joint ids', () => {
    const { recorder, store, tick } = rig();

    for (let ms = 0; ms <= 25_000; ms += 100) {
      tick(ms);
      recorder.status({ mode: 'test', run: 'running', q: [ms / 100_000] });
      recorder.intent([ms / 100_000 + 0.1]);
    }

    const run = recorder.readRun();

    expect(run.joints).toEqual(['shoulder']);
    expect(run.statuses).toHaveLength(201);
    expect(run.intents).toHaveLength(202);
    expect(run.statuses[0].at).toBe(5000);
    expect(run.intents.at(-1)).toEqual({ at: 25_000, joints: [0.35] });
    expect(store.session('run-1').toString()).toContain('"q":[0.35]');
    expect(recorder.session.lines).toEqual([]);
  });

  it('retains the most recent accepted goal before the first status for replay', () => {
    const text = [
      { k: 'status', t: 0, q: [0] },
      { k: 'intent', t: 0.01, q: [0.3] },
      { k: 'status', t: 0.1, q: [0.1] },
      { k: 'status', t: 20.1, q: [0.3] },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n');
    const run = readRecordedRun({ read: () => text }, { id: 'run', joints: ['shoulder'] });

    expect(run.statuses[0].at).toBe(100);
    expect(run.intents).toEqual([{ at: 10, joints: [0.3] }]);
  });

  it('keeps unit selection and the last ended run after disconnect, recording only accepted goals', () => {
    const { store } = rig();
    let now = 0;
    const { fleet } = fleetWithFake({ tries: sessionSink(store), clock: () => now });

    fleets.push(fleet);

    for (const unit of ['arm-a', 'arm-b']) {
      fleet.connect({ family: 'feetech', ids: [1], class: 'arm', emulated: true }, unit);
      fleet.record({ scene: { sceneId: 'scene-1', robot: 'Arm', modelHash: HASH, joints: [unit] } }, unit);

      const link = fleet.entryOf(unit).link;
      const say = (event) => link.onLine(link.session, JSON.stringify(event));

      say({ event: 'status', mode: 'look', run: 'idle', joints: [{ id: 1, position: 2048 }] });
      fleet.command({ cmd: 'intent', joints: [0.1] }, unit);
      expect(fleet.readRun(unit).intents).toEqual([]);
      say({ event: 'status', mode: 'test', run: 'running', joints: [{ id: 1, position: 2200 }] });
      fleet.command({ cmd: 'intent', joints: [0.4] }, unit);
      expect(fleet.readRun(unit).joints).toEqual([unit]);
      expect(fleet.readRun(unit).intents.at(-1).joints).toEqual([0.4]);
      now += 3000;
      say({ event: 'status', mode: 'test', run: 'running', joints: [{ id: 1, position: 2300 }] });
      link.onExit(link.session, 0);
      expect(fleet.readRun(unit).joints).toEqual([unit]);
    }

    expect(fleet.readRun('../auth')).toBeNull();
    expect(fleet.readRun('unknown')).toBeNull();
    expect(fleet.readRun()).toBeNull();
  });

  it('reads an ended recording without keeping another sample buffer', () => {
    const { recorder, store, tick } = rig();

    recorder.status({ mode: 'test', run: 'running', q: [0] });
    tick(3000);
    recorder.status({ mode: 'test', run: 'running', q: [0.2] });
    recorder.intent([0.3]);
    recorder.close('fault');

    expect(readRecordedRun(sessionSink(store), { id: 'run-1', joints: ['shoulder'] }).intents).toEqual([
      { at: 3000, joints: [0.3] },
    ]);
  });

  it('rejects path traversal and oversized or malformed record data', () => {
    const { store } = rig();
    const sink = sessionSink(store);

    expect(() => readRecordedRun(sink, { id: '../auth', joints: ['shoulder'] })).toThrow();
    store.appendSession('bad', '{"k":"status","t":1,"q":[0,1]}\n');
    expect(readRecordedRun(sink, { id: 'bad', joints: ['shoulder'] })).toBeNull();
    expect(readRecordedRun({ read: () => 'x'.repeat(1024 * 1024 + 1) }, { id: 'bad', joints: ['a'] })).toBeNull();
  });

  it('bounds high-rate replies and rejects nonfinite timestamps and unaccepted null goals', () => {
    const text = Array.from({ length: 2200 }, (_, k) => [
      JSON.stringify({ k: 'status', t: k / 100, q: [0.1] }),
      JSON.stringify({ k: 'intent', t: k / 100, q: [0.2] }),
    ])
      .flat()
      .join('\n');
    const run = readRecordedRun({ read: () => text }, { id: 'fast', joints: ['shoulder'] });

    expect(run.statuses).toHaveLength(1024);
    expect(run.intents).toHaveLength(1024);
    expect(run.intents[0].at).toBeLessThan(run.statuses[0].at);
    expect(run.statuses.at(-1).at - run.statuses[0].at).toBeLessThanOrEqual(20_000);

    const malformed = '{"k":"status","t":1e308,"q":[0.1]}\n{"k":"intent","t":1,"q":[null]}\n';

    expect(readRecordedRun({ read: () => malformed }, { id: 'bad', joints: ['shoulder'] })).toBeNull();
  });

  it('reads a bounded tail of a huge file and never returns input samples or unfinished lines', () => {
    const { store } = rig();

    store.appendSession('huge', '');

    const file = path.join(store.triesDir, 'huge', 'session.jsonl');
    const fd = fs.openSync(file, 'r+');
    const tail =
      '\n{"k":"status","t":30,"q":[0.2]}\n{"k":"intent","t":30,"q":[0.3]}\n{"k":"input","t":30,"values":[123]}\n{"k":"status"';

    fs.writeSync(fd, tail, 512 * 1024 * 1024);
    fs.closeSync(fd);

    const run = readRecordedRun(sessionSink(store), { id: 'huge', joints: ['shoulder'] });

    expect(run.statuses).toEqual([{ at: 30_000, positions: [0.2] }]);
    expect(run.intents).toEqual([{ at: 30_000, joints: [0.3] }]);
    expect(JSON.stringify(run)).not.toContain('123');
  });
});
