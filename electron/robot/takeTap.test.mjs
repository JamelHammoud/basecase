import { describe, expect, it } from 'vitest';
import { BY_HAND, decodeTake } from './robotTake.mjs';
import { TakeTap } from './takeTap.mjs';

const IDS = [1, 2, 3];
const JOINTS = ['shoulder', 'elbow', 'wrist'];
const HZ = 50;

function rig(options = {}) {
  let clock = 0;
  let next = 0;
  const saved = [];
  const events = [];
  const rows = new Map();
  const sink = {
    open: (id) => rows.set(id, []),
    append: (id, row) => rows.get(id)?.push(row),
    finish: ({ id, kept, take }) => {
      if (kept) saved.push({ id, manifest: take.manifest(), bytes: take.bytes() });
    },
  };
  const tap = new TakeTap({
    sink,
    emit: (e) => events.push(e),
    now: () => clock,
    joints: () => options.joints ?? JOINTS,
    positionsOf: (status) => status.joints.map((j) => j.rad ?? null),
    ids: options.ids ?? IDS,
    newId: () => `try-test-${next++}`,
  });
  const status = (mode, rads, extra = {}) =>
    tap.event({
      event: 'status',
      mode,
      run: 'running',
      joints: rads.map((rad, k) => ({ id: (options.ids ?? IDS)[k], rad, ...(extra[k] ?? {}) })),
    });
  const run = (seconds, mode, pose, each = () => {}) => {
    const frames = Math.round(seconds * HZ);

    for (let n = 0; n < frames; n++) {
      clock += 1000 / HZ;
      each(n);
      status(mode, pose(n / HZ));
    }
  };

  return { tap, saved, events, rows, status, run, flush: () => new Promise((r) => setTimeout(r, 0)) };
}

const still = () => [0, 0, 0];
const sway = (t) => [0.3 * Math.sin(t), 0.2 * Math.sin(2 * t), 0];

describe('take tap', () => {
  it('keeps a hand-moved session in Look as a demonstration, closed when the link goes', async () => {
    const r = rig();

    r.run(4, 'look', sway);
    r.tap.event({ event: 'link', state: 'closed' });
    await r.flush();

    expect(r.saved).toHaveLength(1);

    const [{ manifest, bytes }] = r.saved;
    const take = decodeTake(bytes);

    expect(manifest).toMatchObject({ source: 'operate', input: BY_HAND, frames: 200, case: null });
    expect(manifest.outcome).toEqual({ verdict: 'unjudged', margin: null });
    expect(manifest.seconds).toBeCloseTo(3.98, 2);
    expect(take.joints).toEqual(JOINTS);
    expect(take.position[3 * 100]).toBeCloseTo(sway(100 / HZ)[0], 4);
    expect(r.events.map((e) => e.state)).toEqual(['open', 'kept']);
  });

  it('leaves no try for a session under 2 s or one where nothing moved', async () => {
    const r = rig();

    r.run(1.5, 'look', sway);
    r.tap.event({ event: 'link', state: 'closed' });
    r.run(5, 'look', still);
    r.tap.event({ event: 'link', state: 'lost' });
    await r.flush();

    expect(r.saved).toEqual([]);
    expect(r.events.filter((e) => e.state === 'dropped')).toHaveLength(2);
  });

  it('closes a take when the rung drops, and keeps the intents it sent', async () => {
    const r = rig();

    r.run(1, 'look', still);
    r.run(5, 'test', sway, (n) => r.tap.intent(sway((n + 1) / HZ)));
    r.status('look', still());
    await r.flush();

    expect(r.saved).toHaveLength(1);

    const take = decodeTake(r.saved[0].bytes);

    expect(r.saved[0].manifest.input).toBe('sim');
    expect(take.intentT).toHaveLength(250);
    expect(take.intent[3 * 100 + 1]).toBeCloseTo(sway(101 / HZ)[1], 4);
    expect(r.tap.take).not.toBeNull();
  });

  it('keeps a session that stalls mid-run with the fault, even a short one', async () => {
    const r = rig();

    r.run(1, 'test', sway, (n) => r.tap.intent(sway(n / HZ)));
    r.tap.event({ event: 'fault', id: 2, message: 'The joint on servo 2 is stuck.' });
    await r.flush();

    expect(r.saved[0].manifest.fault).toBe('The joint on servo 2 is stuck.');
    expect(r.events.at(-1)).toEqual({ event: 'take', state: 'kept', id: 'try-test-0', fault: true, replayable: true });
  });

  it('carries the policy hash when a policy runs at Rehearse, and not below it', async () => {
    const r = rig();

    r.tap.setPolicy('abc123');
    r.run(3, 'test', sway);
    r.tap.event({ event: 'link', state: 'closed' });
    r.run(3, 'rehearse', sway);
    r.tap.event({ event: 'link', state: 'closed' });
    await r.flush();

    expect(r.saved.map((s) => s.manifest.policy)).toEqual([undefined, 'abc123']);
    expect(r.saved[1].manifest.input).toBe('policy');
  });

  it.each([
    ['camera', Array.from({ length: 99 }, (_, k) => k / 100)],
    ['gamepad', [0.5, -0.25, 0, 1]],
    ['phone', [0.1, -0.2, 0.05]],
    ['leader-arm', [0.3, 0.2, 0.1]],
  ])('keeps the raw values of the %s input with its id', async (id, values) => {
    const r = rig();

    r.run(3, 'test', sway, () => r.tap.sample({ twin: [0.1, 0.2, null], input: { id, values } }));
    r.tap.event({ event: 'link', state: 'closed' });
    await r.flush();

    const take = decodeTake(r.saved[0].bytes);

    expect(r.saved[0].manifest.input).toBe(id);
    expect(take.inputIds).toEqual([id]);
    expect(take.inputLength[0]).toBe(values.length);
    expect(Array.from(take.input.subarray(0, values.length))).toEqual(values.map((v) => Math.fround(v)));
    expect(Array.from(take.twin.subarray(0, 3))).toEqual([Math.fround(0.1), Math.fround(0.2), NaN]);
  });

  it('records effort and velocity when the robot reports them', async () => {
    const r = rig();
    const extra = [{ velocity: 0.5, effort: 1.25 }, { effort: -0.5 }, {}];

    r.run(1, 'look', sway);
    r.run(2, 'test', sway, () => {});
    r.status('test', sway(3), extra);
    r.tap.event({ event: 'link', state: 'closed' });
    await r.flush();

    const take = decodeTake(r.saved[0].bytes);
    const last = (take.frames - 1) * 3;

    expect(Array.from(take.effort.subarray(last, last + 3))).toEqual([1.25, -0.5, NaN]);
    expect(take.velocity[last]).toBe(0.5);
    expect(Number.isNaN(take.effort[0])).toBe(true);
  });

  it.each([
    ['keys', 3, 3.5e6],
    ['camera', 99, 15e6],
  ])('keeps every status of a 10-minute 6-joint session driven by %s in under its size', async (id, width, limit) => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    const r = rig({ joints: six, ids: [1, 2, 3, 4, 5, 6] });
    const pose = (t) => six.map((_, k) => 0.4 * Math.sin(t + k));
    const values = (t) => Array.from({ length: width }, (_, k) => Math.sin(t + k));

    r.run(600, 'test', pose, (n) => {
      r.tap.sample({ twin: pose(n / HZ), input: { id, values: values(n / HZ) } });

      if (n % 3 !== 0) r.tap.intent(pose(n / HZ));
    });

    r.tap.event({ event: 'link', state: 'closed' });
    await r.flush();

    const [{ manifest, bytes }] = r.saved;

    expect(manifest.frames).toBe(600 * HZ);
    expect(decodeTake(bytes).frames).toBe(600 * HZ);
    expect(bytes.byteLength).toBeLessThan(limit);
  });
});
