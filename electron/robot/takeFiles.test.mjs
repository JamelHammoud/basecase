import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TryStore } from '../library/tryStore.mjs';
import { linkWithFake } from './robotLinkFake.mjs';
import { decodeTake } from './robotTake.mjs';
import { TAKE_LOG, TakeFiles } from './takeFiles.mjs';

const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
const ROS2_ARM = {
  family: 'ros2',
  emulated: true,
  controller: { kind: 'forward_position', topic: '/forward_position_controller/commands' },
  joints: ['shoulder', 'elbow'],
};
const COUNTS_PER_RAD = 4096 / (2 * Math.PI);
const counts = (rad) => Math.round(2048 + rad * COUNTS_PER_RAD);

function storeAt() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-takes-'));

  return new TryStore({ triesDir: path.join(dir, 'tries'), cacheFile: path.join(dir, 'cache.json') });
}

function rigged(store = storeAt()) {
  let clock = 0;
  const takes = new TakeFiles({ store, flushMs: 10 });
  const made = linkWithFake({ takes, now: () => clock });
  const tick = (ms) => {
    clock += ms;
  };

  return { ...made, store, takes, tick };
}

const flushed = () => new Promise((resolve) => setImmediate(resolve));

async function say(child, events) {
  for (const event of events) child.say(event);

  await flushed();
}

const status = (mode, rads, extra = () => ({})) => ({
  event: 'status',
  mode,
  run: 'running',
  sealed: false,
  fault_latched: false,
  joints: rads.map((rad, k) => ({ id: k + 1, position: counts(rad), reply: 'ok', ...extra(k) })),
});

afterEach(() => vi.useRealTimers());

describe('takes recorded by the robot link', () => {
  it('keeps a Test session as an Operate try whose intents follow what the app sent', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });

    const { link, spawned, events, store, tick } = rigged();

    link.connect(ARM);
    link.takeScene({ sceneId: 'scene-arm', robot: 'Arm', joints: ['shoulder', 'elbow'] });

    const { child } = spawned[0];

    await say(child, [status('look', [0, 0]), { event: 'mode', mode: 'test' }]);

    for (let n = 1; n <= 150; n++) {
      const pose = [0.4 * Math.sin(n / 25), 0.3 * Math.sin(n / 30)];

      link.command({ cmd: 'intent', joints: pose });
      vi.advanceTimersByTime(30);
      tick(30);
      await say(child, [status('test', pose)]);
    }

    await say(child, [{ event: 'mode', mode: 'look' }]);

    const [summary] = store.list();
    const take = decodeTake(store.recording(summary.id));

    expect(summary).toMatchObject({ source: 'operate', sceneId: 'scene-arm', robot: 'Arm', input: 'sim' });
    expect(take.joints).toEqual(['shoulder', 'elbow']);
    expect(take.intentT.length).toBeGreaterThan(140);
    expect(take.intent[2 * 99]).toBeCloseTo(0.4 * Math.sin(100 / 25), 4);
    expect(take.position[2 * 100]).toBeCloseTo(0.4 * Math.sin(100 / 25), 2);
    expect(events.filter((e) => e.event === 'take').map((e) => e.state)).toEqual(['open', 'kept']);
    expect(fs.existsSync(path.join(store.dirOf(summary.id), TAKE_LOG))).toBe(false);
    link.dispose();
  });

  it('records effort from a ros2_control arm’s joint states', async () => {
    const { link, spawned, store, tick } = rigged();

    link.connect(ROS2_ARM);

    const { child } = spawned[0];

    for (let n = 0; n < 150; n++) {
      tick(20);
      await say(child, [status('look', [n / 100, 0], (k) => ({ velocity: 0.5, effort: k + 0.25 }))]);
    }

    child.emit('exit');
    await flushed();

    const take = decodeTake(store.recording(store.list()[0].id));

    expect(Array.from(take.effort.subarray(0, 2))).toEqual([0.25, 1.25]);
    expect(take.velocity[0]).toBe(0.5);
  });

  it('closes the take on a disconnect, and appends rows to disk while it runs', async () => {
    const { link, spawned, store, tick } = rigged();

    link.connect(ARM);

    const { child } = spawned[0];

    for (let n = 0; n < 50; n++) {
      tick(20);
      await say(child, [status('look', [n / 50, 0])]);
    }

    await new Promise((resolve) => setTimeout(resolve, 30));

    const [dir] = fs.readdirSync(store.triesDir);
    const logged = fs
      .readFileSync(path.join(store.triesDir, dir, TAKE_LOG), 'utf-8')
      .trim()
      .split('\n');

    expect(logged.length).toBeGreaterThan(40);
    expect(store.list()).toEqual([]);
    link.disconnect();
    child.emit('exit');
    await flushed();

    expect(fs.readdirSync(store.triesDir)).toEqual([]);
  });

  it('turns a take left on disk by a crash into a try when the app starts again', async () => {
    const store = storeAt();
    const crashed = rigged(store);

    crashed.link.connect(ARM);

    for (let n = 0; n < 200; n++) {
      crashed.tick(20);
      await say(crashed.spawned[0].child, [status('look', [Math.sin(n / 20), 0])]);
    }

    crashed.takes.stop();
    expect(store.list()).toEqual([]);

    const restarted = new TakeFiles({ store });

    expect(restarted.recover()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({ source: 'operate', input: 'by-hand', frames: 200 });
  });

  it('refuses a scene or sample that isn’t exactly the documented shape', () => {
    const { link } = rigged();

    expect(link.takeScene({ sceneId: '../x', robot: 'Arm', joints: [] }).ok).toBe(false);
    expect(link.takeScene({ sceneId: 's', robot: 'Arm', joints: [], extra: 1 }).ok).toBe(false);
    expect(link.takeSample({ input: { id: 'gamepad', values: ['1'] } }).ok).toBe(false);
    expect(link.takeSample({ input: { id: 'Gamepad!', values: [1] } }).ok).toBe(false);
    expect(link.takeSample({ twin: [0.1, null], input: { id: 'gamepad', values: [1] } })).toEqual({ ok: true });
  });
});
