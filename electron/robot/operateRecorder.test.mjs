import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readOperateLog } from '../../src/robot/operateLog';
import { replayable, runOf } from '../../src/robot/runBuffer';
import { sessionSink, TryStore } from '../library/tryStore.mjs';
import { OperateRecorder } from './operateRecorder.mjs';
import { linkWithFake } from './robotLinkFake.mjs';

const HASH = 'a'.repeat(64);
const COUNTS_PER_RAD = 4096 / (2 * Math.PI);
const counts = (rad) => Math.round(2048 + rad * COUNTS_PER_RAD);

const servoSpec = (n, cls = 'arm') => ({
  family: 'feetech',
  ids: Array.from({ length: n }, (_, k) => k + 1),
  class: cls,
  emulated: true,
});
const ROS2_ARM = {
  family: 'ros2',
  emulated: true,
  controller: { kind: 'forward_position', topic: '/forward_position_controller/commands' },
  joints: ['shoulder_pan_joint', 'elbow_joint'],
};
const G1 = { family: 'unitree-g1', emulated: true };

const links = [];

afterEach(() => {
  for (const link of links.splice(0)) link.dispose();
});

function rig(ask, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-operate-'));
  const store = new TryStore({ triesDir: path.join(dir, 'tries'), cacheFile: path.join(dir, 'tries.json') });
  let now = 1_700_000_000_000;
  const { link, events } = linkWithFake({ tries: sessionSink(store), clock: () => now, ...options });

  links.push(link);
  options.before?.(link);
  expect(link.connect(ask)).toEqual({ ok: true });

  const ids = link.session.spec.ids;
  const joints = ids.map((id) => `joint_${id}`);
  const say = (event) => link.onLine(link.session, JSON.stringify(event));
  const status = (mode, rad, extra = {}) =>
    say({
      event: 'status',
      at_us: now * 1000,
      mode,
      run: mode === 'look' || mode === 'set_up' ? 'idle' : 'running',
      sealed: false,
      fault_latched: false,
      joints: ids.map((id, k) => ({ id, position: counts(rad(k)), reply: 'ok', ...extra })),
    });
  const tick = (ms) => {
    now += ms;
  };
  const recorded = () => events.filter((e) => e.event === 'recorded');
  const kept = () => recorded().flatMap((e) => (e.manifest ? [e.manifest] : []));
  const log = (id) => readOperateLog(store.session(id)?.toString('utf-8') ?? '');

  link.record({ scene: { sceneId: 'scene-1', robot: 'Arm', modelHash: HASH, joints } });

  return { link, store, say, status, tick, recorded, kept, log, ids, joints, events };
}

function climb(r, to = 'test') {
  for (const mode of ['set_up', 'test', 'rehearse'].slice(0, ['set_up', 'test', 'rehearse'].indexOf(to) + 1))
    r.say({ event: 'mode', mode });
}

function drive(r, { seconds, input, mode = 'test', every = 100 }) {
  for (let ms = 0; ms <= seconds * 1000; ms += every) {
    const angles = r.ids.map((_, k) => 0.2 * Math.sin(ms / 1000 + k));

    r.link.command({ cmd: 'intent', joints: angles });

    if (input && ms % 50 === 0) r.link.record({ input: { id: input.id, values: input.values(angles) } });

    if (ms % 100 === 0) r.status(mode, (k) => angles[k]);

    r.tick(every);
  }
}

describe('Operate recording on a connected robot', () => {
  it('records a leader arm driving the emulated SO-101 in Test, with intents following the leader', () => {
    const r = rig(servoSpec(6));

    r.status('look', () => 0);
    climb(r);
    drive(r, { seconds: 4, input: { id: 'leader-arm', values: (angles) => angles } });
    r.say({ event: 'mode', mode: 'look' });

    const [manifest] = r.kept();
    const log = r.log(manifest.id);

    expect(manifest).toMatchObject({ source: 'operate', input: 'leader-arm', ended: 'rung', family: 'feetech' });
    expect(manifest.outcome).toEqual({ verdict: 'unjudged', margin: null });
    expect(log.intents.length).toBeGreaterThan(30);
    expect(log.inputs.at(-1).values).toEqual(log.intents.at(-1).q);
    expect(fs.existsSync(path.join(r.store.triesDir, manifest.id, 'try.json'))).toBe(true);
  });

  it('keeps the pose landmarks of camera teleop on the emulated G1 arms', () => {
    const r = rig(G1);
    const landmarks = Array.from({ length: 99 }, (_, i) => (i % 3 === 2 ? 1 : i / 200));

    r.status('look', () => 0);
    r.say({ event: 'mode', mode: 'set_up' });
    r.say({ event: 'mode', mode: 'test' });
    drive(r, { seconds: 3, input: { id: 'camera', values: () => landmarks } });
    r.say({ event: 'mode', mode: 'look' });

    const [manifest] = r.kept();

    expect(r.ids).toHaveLength(17);
    expect(manifest.input).toBe('camera');
    expect(r.log(manifest.id).inputs[0].values).toEqual(landmarks.map((v) => Math.round(v * 1e4) / 1e4));
  });

  it.each([
    ['a gamepad drives the emulated hexapod', 18, 'gamepad', [0.5, -1, 0, 0, 1, 0]],
    ['phone tilt drives a quadruped', 12, 'phone', [12.5, -4, 0, 0, 1, 0]],
  ])('records %s', (_name, servos, id, values) => {
    const r = rig(servoSpec(servos, 'legged'));

    r.status('look', () => 0);
    climb(r);
    drive(r, { seconds: 3, input: { id, values: () => values } });
    r.say({ event: 'mode', mode: 'look' });

    const [manifest] = r.kept();
    const log = r.log(manifest.id);

    expect(manifest.input).toBe(id);
    expect(log.statuses[0].q).toHaveLength(servos);
    expect(log.inputs.every((i) => i.id === id && i.values.join() === values.join())).toBe(true);
  });

  it('records effort and velocity from a ROS 2 arm’s /joint_states', () => {
    const r = rig(ROS2_ARM);

    r.status('look', () => 0);
    r.say({ event: 'mode', mode: 'set_up' });
    r.say({ event: 'mode', mode: 'test' });

    for (let n = 0; n < 30; n++) {
      r.status('test', (k) => 0.01 * n * (k + 1), { velocity: 0.1, effort: 1.25 });
      r.tick(100);
    }

    r.link.disconnect();
    r.link.onExit(r.link.session, null);

    const [manifest] = r.kept();
    const status = r.log(manifest.id).statuses.at(-1);

    expect(manifest.ended).toBe('disconnect');
    expect(status.e).toEqual([1.25, 1.25]);
    expect(status.v).toEqual([0.1, 0.1]);
  });

  it('keeps an arm moved by hand in Look as a demonstration, with no intents', () => {
    const r = rig(servoSpec(3));

    for (let n = 0; n <= 30; n++) {
      r.status('look', (k) => (k === 0 ? 0.02 * n : 0));
      r.tick(100);
    }

    r.link.disconnect();
    r.link.onExit(r.link.session, null);

    const [manifest] = r.kept();

    expect(manifest).toMatchObject({ source: 'operate', input: null, frames: 31 });
    expect(r.log(manifest.id).intents).toEqual([]);
  });

  it('carries the policy’s hash when Rehearse runs one', () => {
    const bytes = Buffer.from('onnx policy bytes');
    const r = rig(servoSpec(2), {
      policyBytes: () => bytes,
      before: (link) => link.policy([{ kind: 'policy', id: 'p1' }]),
    });

    r.status('look', () => 0);
    climb(r, 'rehearse');
    drive(r, { seconds: 3, mode: 'rehearse' });
    r.say({ event: 'mode', mode: 'look' });

    const [manifest] = r.kept();

    expect(manifest.policy).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(manifest.input).toBe('policy');
  });
});

describe('How an Operate try ends', () => {
  it('keeps the try when a servo stalls, and Replay in Sim reads its last 20 s from it', () => {
    const r = rig(servoSpec(3));

    r.status('look', () => 0);
    climb(r);
    drive(r, { seconds: 25 });
    r.say({ event: 'fault', code: 'stall', id: 2, message: 'The joint on servo 2 is stuck.' });
    r.status('test', () => 0);

    const [manifest] = r.kept();
    const log = r.log(manifest.id);
    const run = runOf(log, { joints: r.joints, faultJoint: 'joint_2', faultAt: 0, message: 'stuck' });

    expect(manifest.ended).toBe('fault');
    expect(log.faults).toEqual([expect.objectContaining({ code: 'stall', id: 2 })]);
    expect(replayable(run)).toBe(true);
    expect(run.statuses.at(-1).at - run.statuses[0].at).toBeLessThanOrEqual(20_000);
    expect(log.statuses.length - run.statuses.length).toBeGreaterThan(40);
    expect(r.recorded()).toHaveLength(1);
  });

  it('closes the try cleanly when the robot disconnects, with every line whole', () => {
    const r = rig(servoSpec(2));

    r.status('look', () => 0);
    climb(r);
    drive(r, { seconds: 3 });
    r.link.disconnect();
    r.link.onExit(r.link.session, null);

    const [manifest] = r.kept();
    const text = r.store.session(manifest.id).toString('utf-8');

    expect(manifest.ended).toBe('disconnect');
    expect(text.endsWith('\n')).toBe(true);
    expect(
      text
        .trim()
        .split('\n')
        .every((line) => JSON.parse(line).t >= 0),
    ).toBe(true);
    expect(r.events.at(-1)).toEqual({ event: 'link', state: 'closed' });
  });

  it('records a 10-minute session without dropping a status, under 400 KB a minute', () => {
    const ids = [1, 2, 3, 4, 5, 6];
    const text = [];
    let now = 0;
    let manifest = null;
    const recorder = new OperateRecorder({
      spec: { family: 'feetech', ids },
      sink: { append: (_id, chunk) => text.push(chunk), keep: (m) => (manifest = m), drop: () => {} },
      radians: (status) => status.joints.map((j) => j.rad),
      clock: () => now,
    });
    const status = (rad) => ({ event: 'status', mode: 'test', run: 'running', joints: rad.map((v) => ({ rad: v })) });

    recorder.setContext({ sceneId: 'scene-1', robot: 'Arm', modelHash: HASH, joints: ids.map(String) });

    for (let ms = 0; ms <= 600_000; ms += 25) {
      const angles = ids.map((k) => 0.2 * Math.sin(ms / 1000 + k));

      recorder.intent(angles);

      if (ms % 50 === 0) recorder.sample({ input: { id: 'gamepad', values: [0.5, 0, 0, 0, 0, 0] } });

      if (ms % 100 === 0) recorder.event(status(angles));

      now += 25;
    }

    recorder.event({ event: 'mode', mode: 'look' });

    const log = text.join('');

    expect(readOperateLog(log).statuses).toHaveLength(6001);
    expect(manifest.frames).toBe(6001);
    expect(log.length / 10).toBeLessThan(400 * 1024);
  });

  it('leaves no try for a session under 2 s or one where nothing moved', () => {
    const short = rig(servoSpec(2));

    short.status('look', () => 0);
    climb(short);
    drive(short, { seconds: 1 });
    short.say({ event: 'mode', mode: 'look' });

    const still = rig(servoSpec(2));

    for (let n = 0; n < 50; n++) {
      still.status('look', () => 0.1);
      still.tick(100);
    }

    still.link.disconnect();
    still.link.onExit(still.link.session, null);

    for (const r of [short, still]) {
      expect(r.recorded()[0].manifest).toBeNull();
      expect(r.store.list()).toEqual([]);
      expect(fs.readdirSync(r.store.triesDir)).toEqual([]);
    }
  });
});
