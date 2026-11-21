import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TryStore, sessionSink } from '../library/tryStore.mjs';
import { readStoredTry } from '../../src/cases/tryFile';
import { readOperateLog } from '../../src/robot/operateLog';
import { readBodyRecording } from '../../src/reality/bodyRecordingRun';
import { linkWithFake } from './robotLinkFake.mjs';

const HASH = 'a'.repeat(64);
const SOURCE = 'b'.repeat(64);
const SPEC = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
let rig;
let dir;
let store;
let now;

function say(event) {
  rig.link.onLine(rig.link.session, JSON.stringify(event));
}

function status(positions = [2048, 2048]) {
  say({
    event: 'status',
    mode: 'test',
    run: 'running',
    sealed: false,
    fault_latched: false,
    joints: positions.map((position, index) => ({ id: index + 1, position, torque_on: true, reply: 'ok' })),
  });
}

function start() {
  return rig.link.command({
    cmd: 'claim_control',
    control: rig.link.state().control,
    seconds: 0.2,
    recording: { recommendation: HASH, sourceKey: SOURCE },
    binding: {
      spec: rig.link.state().spec,
      calibration: rig.link.state().calibration,
      scene: rig.link.session.recorder.context,
      start: [0, 0],
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  now = 1000;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-motion-recording-'));
  store = new TryStore({ triesDir: path.join(dir, 'tries'), cacheFile: path.join(dir, 'cache.json') });
  rig = linkWithFake({ tries: sessionSink(store), clock: () => now });
  rig.link.connect(SPEC);
  rig.link.record({ scene: { sceneId: 'scene', robot: 'Arm', modelHash: HASH, joints: ['a', 'b'] } });
  say({ event: 'hello', emulated: true });
  status();
});

afterEach(() => {
  rig.link.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('selected motions as ordinary Operate recordings', () => {
  it('refuses a start that changed before the backend receives the claim', () => {
    status([2100, 2048]);

    expect(start().ok).toBe(false);
    expect(store.list()).toEqual([]);
    expect(rig.link.controlFor(rig.link.session).held).toBe(false);
  });

  it('stops and reports storage failure while appending received observations', () => {
    expect(start().ok).toBe(true);
    rig.link.session.recorder.sink.append = () => false;
    now += 300;
    status();

    expect(rig.link.controlFor(rig.link.session).held).toBe(false);
    expect(rig.events).toContainEqual(
      expect.objectContaining({ event: 'control', completion: 'storage', held: false }),
    );
    expect(rig.spawned[0].child.sent).toContainEqual({ cmd: 'stop' });
    expect(store.list()).toEqual([]);
  });

  it('keeps a bounded stationary run and paced commands with immutable provenance', async () => {
    const claimed = start();

    expect(claimed.ok).toBe(true);
    expect(rig.link.command({ cmd: 'intent', joints: [0.01, -0.02], control: claimed.control }).ok).toBe(true);
    now += 100;
    await vi.advanceTimersByTimeAsync(100);
    status();
    now += 100;
    await vi.advanceTimersByTimeAsync(100);

    const [summary] = store.list();
    const [manifest] = store.manifests([summary.id]);
    const parsed = readStoredTry(manifest);
    const log = readOperateLog(store.session(summary.id).toString());

    expect(parsed).toMatchObject({
      source: 'operate',
      outcome: { verdict: 'unjudged' },
      bodyMotion: {
        recommendation: HASH,
        sourceKey: SOURCE,
        completion: 'completed',
        backend: 'servo-independent-1',
      },
    });
    expect(log.statuses.map((entry) => entry.q)).toEqual([[0, 0]]);
    expect(log.intents.map((entry) => entry.q)).toContainEqual([0.01, -0.02]);
    expect(parsed.robot.joints).toEqual(['a', 'b']);
  });

  it('replaces the previous stream with the declared start before the first renderer target arrives', async () => {
    expect(rig.link.command({ cmd: 'intent', joints: [0.4, -0.3] }).ok).toBe(true);

    const claimed = start();

    expect(claimed.ok).toBe(true);
    now += 30;
    await vi.advanceTimersByTimeAsync(30);
    expect(rig.spawned[0].child.sent.filter((command) => command.cmd === 'intent')).toEqual([
      { cmd: 'intent', joints: [0, 0] },
    ]);
    rig.link.command({ cmd: 'stop', control: claimed.control });

    const [stored] = store.manifests(store.list().map((entry) => entry.id));
    const log = readOperateLog(store.session(stored.id).toString());

    expect(log.intents.map((entry) => entry.q)).toEqual([[0, 0]]);
    expect(stored.bodyMotion.completion).toBe('cancelled');
  });

  it.each(['stop', 'disconnect', 'fault'])('retains an interrupted %s without a completed claim', (ending) => {
    const claimed = start();

    expect(claimed.ok).toBe(true);
    now += 30;
    status();

    if (ending === 'stop') rig.link.command({ cmd: 'stop', control: claimed.control });

    if (ending === 'disconnect') rig.link.disconnect();

    if (ending === 'fault') say({ event: 'fault', code: 'stall' });

    const recorded = rig.events.filter((event) => event.event === 'recorded' && event.manifest?.bodyMotion);

    expect(recorded).toHaveLength(1);
    expect(recorded[0].manifest.bodyMotion.completion).toBe(ending === 'stop' ? 'cancelled' : ending);
    expect(readStoredTry(recorded[0].manifest)).not.toBeNull();
  });

  it.each(['rung', 'fault'])('drains delivered commands before retaining an interrupted %s', (ending) => {
    const session = rig.link.session;

    session.pipe.idle = vi.fn();

    const claimed = start();

    expect(claimed.ok).toBe(true);
    now += 30;
    status();

    if (ending === 'fault') say({ event: 'fault', code: 'stall' });
    else say({ event: 'mode', mode: 'look' });

    expect(rig.events.some((event) => event.event === 'recorded' && event.manifest?.bodyMotion)).toBe(false);
    rig.link.recordDelivered(session, [0.01, -0.02], { ...claimed.control, at: now - 10 });
    rig.link.controlFor(session).flushCompletion();

    const [stored] = store.manifests(store.list().map((entry) => entry.id));
    const text = store.session(stored.id).toString();
    const run = readBodyRecording({
      session: text,
      id: stored.id,
      joints: stored.robot.joints,
      motion: stored.bodyMotion,
    });

    expect(stored.bodyMotion.completion).toBe(ending === 'fault' ? 'fault' : 'stale');
    expect(run?.statuses).toHaveLength(1);
    expect(run?.intents.map((entry) => entry.joints)).toEqual([[0.01, -0.02]]);
    expect(JSON.parse(text.trim().split('\n').at(-1))).toMatchObject({
      k: 'motion-end',
      completion: stored.bodyMotion.completion,
    });
  });

  it('refuses a recording declaration before commands when storage cannot open', () => {
    const original = rig.link.session.recorder.sink;

    rig.link.session.recorder.sink = {
      ...original,
      append: () => {
        throw new Error('storage unavailable');
      },
    };
    expect(start().ok).toBe(false);
    expect(rig.link.controlFor(rig.link.session).held).toBe(false);
    expect(rig.spawned[0].child.sent.some((command) => command.cmd === 'intent')).toBe(false);
  });
});
