import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { unitSeed } from './robotFleet.mjs';
import { fleetWithFake } from './robotLinkFake.mjs';
import { DEFAULT_UNIT, MAX_UNITS } from './units.mjs';

const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
const HELLO = { event: 'hello', emulated: true, real_transport: false, lost_message: 'Lost contact with the robot.' };
const ARMS = ['arm-a', 'arm-b', 'arm-c'];
const SKILL_A = 'a'.repeat(64);
const SKILL_B = 'b'.repeat(64);
const SCENE = 'c'.repeat(64);

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flagOf = (args, flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const artefactsOf = ({ args }) => flagOf(args, '--artefacts');
const seedOf = ({ args }) => flagOf(args, '--seed');
const skillBytes = (ref) => (ref.kind === 'skill' ? Buffer.from(`onnx for ${ref.hash}`) : null);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

const placedHash = (spawn) => {
  const file = path.join(artefactsOf(spawn), 'policy.onnx');

  return fs.existsSync(file) ? sha(fs.readFileSync(file)) : null;
};

const bytesHash = (hash) => sha(skillBytes({ kind: 'skill', hash }));

let fleets = [];

function fakeFleet(options) {
  const made = fleetWithFake(options);

  fleets.push(made.fleet);

  return made;
}

function connectAll(fleet, names) {
  for (const name of names) expect(fleet.connect(ARM, name), name).toEqual({ ok: true });
}

async function climbToTest(spawned) {
  for (const { child } of spawned) {
    child.say(HELLO);
    child.say({ event: 'status', mode: 'look', run: 'idle', joints: [{ id: 1, position: 2048 }] });
    child.say({ event: 'mode', mode: 'test' });
  }

  await settle(80);
}

afterEach(() => {
  for (const fleet of fleets) fleet.dispose();

  fleets = [];
});

describe('robot fleet', () => {
  it('connects three arms at once, each with its own daemon, folder and seed, every event tagged', () => {
    const { fleet, spawned, events } = fakeFleet();

    connectAll(fleet, ['arm-c', 'arm-a', 'arm-b']);

    expect(spawned).toHaveLength(3);
    expect(new Set(spawned.map(artefactsOf)).size).toBe(3);
    expect(spawned.map(seedOf)).toEqual(['arm-c', 'arm-a', 'arm-b'].map((name) => String(unitSeed(name))));
    expect(new Set(spawned.map(seedOf)).size).toBe(3);
    expect(events.every((event) => ARMS.includes(event.unit))).toBe(true);
    expect(events.filter((event) => event.event === 'link').map((event) => event.unit)).toEqual([
      'arm-c',
      'arm-a',
      'arm-b',
    ]);
    expect(fleet.units().map((state) => [state.unit, state.connected])).toEqual(ARMS.map((name) => [name, true]));
  });

  it('keeps the other two arms in Test, driving, when a stall faults one', async () => {
    const { fleet, spawned, events } = fakeFleet();

    connectAll(fleet, ARMS);
    await climbToTest(spawned);

    const faulted = spawned[1].child;

    faulted.say({ event: 'fault', code: 'stall', id: 2, message: 'Servo 2 stalled.' });
    faulted.say({ event: 'mode', mode: 'look' });
    await settle();

    expect(fleet.command({ cmd: 'intent', joints: [0.25, -0.5] }, 'arm-a')).toEqual({ ok: true });
    expect(fleet.command({ cmd: 'intent', joints: [-0.1, 0.3] }, 'arm-c')).toEqual({ ok: true });
    await settle(80);

    expect(spawned[0].child.sent.at(-1)).toEqual({ cmd: 'intent', joints: [0.25, -0.5] });
    expect(spawned[2].child.sent.at(-1)).toEqual({ cmd: 'intent', joints: [-0.1, 0.3] });
    expect(fleet.units().map((state) => [state.unit, state.mode])).toEqual([
      ['arm-a', 'test'],
      ['arm-b', 'look'],
      ['arm-c', 'test'],
    ]);
    expect(events.filter((event) => event.event === 'fault').map((event) => event.unit)).toEqual(['arm-b']);
  });

  it('never sends one arm’s intents to another', async () => {
    const { fleet, spawned } = fakeFleet();

    connectAll(fleet, ARMS);
    await climbToTest(spawned);

    ARMS.forEach((name, k) => fleet.command({ cmd: 'intent', joints: [k + 0.5, -k] }, name));
    await settle(80);

    spawned.forEach(({ child }, k) => {
      const intents = child.sent.filter((command) => command.cmd === 'intent' && command.joints[0] !== 0);

      expect(intents.length, ARMS[k]).toBeGreaterThan(0);
      expect(intents.every((command) => command.joints[0] === k + 0.5)).toBe(true);
    });
  });

  it('runs twelve arms side by side', () => {
    const { fleet, spawned } = fakeFleet();
    const names = Array.from({ length: 12 }, (_, k) => `arm-${String(k + 1).padStart(2, '0')}`);

    connectAll(fleet, names);

    expect(spawned).toHaveLength(12);
    expect(fleet.units().map((state) => state.unit)).toEqual(names);
  });

  it('rolls one arm back to its previous policy while the others stay on the scene’s', () => {
    const { fleet, spawned, events } = fakeFleet({ policyBytes: skillBytes });

    expect(fleet.policy([{ kind: 'skill', hash: SCENE }])).toEqual({ ok: true });
    connectAll(fleet, ['arm-a', 'arm-b']);

    const [pinned, other] = spawned;

    expect(fleet.rollBack('arm-a')).toEqual({ ok: false, message: expect.any(String) });
    expect(fleet.policy([{ kind: 'skill', hash: SKILL_A }], 'arm-a')).toEqual({ ok: true });
    expect(fleet.policy([{ kind: 'skill', hash: SKILL_B }], 'arm-a')).toEqual({ ok: true });
    expect(placedHash(pinned)).toBe(bytesHash(SKILL_B));
    expect(fleet.state('arm-a')).toMatchObject({ version: SKILL_B, previous: SKILL_A });

    expect(fleet.rollBack('arm-a')).toEqual({ ok: true });
    expect(placedHash(pinned)).toBe(bytesHash(SKILL_A));
    expect(fleet.state('arm-a')).toMatchObject({ unit: 'arm-a', version: SKILL_A, previous: SCENE });
    expect(events.filter((event) => event.event === 'policy').at(-1)).toEqual({
      event: 'policy',
      unit: 'arm-a',
      version: SKILL_A,
      previous: SCENE,
      hasPrevious: true,
    });

    expect(fleet.rollBack('arm-a')).toEqual({ ok: true });
    expect(placedHash(pinned)).toBe(bytesHash(SCENE));
    expect(fleet.state('arm-a').version).toBe(SCENE);
    expect(fleet.rollBack('arm-a').ok).toBe(false);

    expect(placedHash(other)).toBe(bytesHash(SCENE));
    expect(fleet.state('arm-b')).toMatchObject({ version: SCENE, previous: null });
    expect(fleet.rollBack('arm-b').ok).toBe(false);
    expect(pinned.child.sent.filter((command) => command.cmd === 'recheck')).toHaveLength(4);
  });

  it('gives each arm the same seed every time it connects, and the scene’s robot none', () => {
    const first = fakeFleet();
    const second = fakeFleet();

    connectAll(first.fleet, [DEFAULT_UNIT, ...ARMS]);
    connectAll(second.fleet, [DEFAULT_UNIT, ...ARMS]);

    expect(first.spawned[0].args).not.toContain('--seed');
    expect(first.spawned.map(seedOf)).toEqual(second.spawned.map(seedOf));
    expect(first.spawned.slice(1).every((spawn) => Number(seedOf(spawn)) >= 2)).toBe(true);
  });
});

describe('robot fleet policy failures', () => {
  it('restores the exact scene policy from before the first pin after the scene changes', () => {
    const { fleet, spawned, events } = fakeFleet({ policyBytes: skillBytes });

    fleet.policy([
      { kind: 'policy', id: 'policy-without-onnx' },
      { kind: 'skill', hash: SKILL_A },
    ]);
    connectAll(fleet, ['arm-a', 'arm-b']);
    expect(fleet.state('arm-a')).toMatchObject({ version: SKILL_A, previous: null, hasPrevious: false });
    expect(fleet.policy([{ kind: 'skill', hash: SKILL_B }], 'arm-a').ok).toBe(true);
    expect(fleet.state('arm-a')).toMatchObject({ version: SKILL_B, previous: SKILL_A, hasPrevious: true });
    fleet.policy([{ kind: 'skill', hash: SCENE }]);
    expect(placedHash(spawned[0])).toBe(bytesHash(SKILL_B));
    expect(placedHash(spawned[1])).toBe(bytesHash(SCENE));
    expect(fleet.state('arm-b')).toMatchObject({ version: SCENE, previous: null });
    expect(events.filter((event) => event.event === 'policy' && event.unit === 'arm-b').at(-1)).toEqual({
      event: 'policy',
      unit: 'arm-b',
      version: SCENE,
      previous: null,
      hasPrevious: false,
    });
    expect(fleet.rollBack('arm-a').ok).toBe(true);
    expect(placedHash(spawned[0])).toBe(bytesHash(SKILL_A));
    expect(fleet.state('arm-a')).toMatchObject({ version: SKILL_A, previous: null });
    expect(events.filter((event) => event.event === 'policy').at(-1)).toEqual({
      event: 'policy',
      unit: 'arm-a',
      version: SKILL_A,
      previous: null,
      hasPrevious: false,
    });
    expect(fleet.rollBack('arm-a').ok).toBe(false);
  });

  it('restores the absence of a prior policy rather than adopting changed scene candidates', () => {
    const { fleet, spawned } = fakeFleet({ policyBytes: skillBytes });

    connectAll(fleet, ['arm-a']);
    expect(fleet.policy([{ kind: 'skill', hash: SKILL_B }], 'arm-a').ok).toBe(true);
    expect(fleet.state('arm-a')).toMatchObject({ version: SKILL_B, previous: null, hasPrevious: true });
    fleet.policy([{ kind: 'skill', hash: SCENE }]);
    expect(fleet.rollBack('arm-a').ok).toBe(true);
    expect(placedHash(spawned[0])).toBeNull();
    expect(fleet.state('arm-a')).toMatchObject({ version: null, previous: null, hasPrevious: false });
  });

  it('keeps the active policy and rollback history when a pin or rollback has no policy bytes', () => {
    const available = new Set([SKILL_A, SKILL_B]);
    const { fleet, spawned, events } = fakeFleet({
      policyBytes: (ref) => (available.has(ref.hash) ? skillBytes(ref) : null),
    });

    connectAll(fleet, ['arm-a']);
    expect(fleet.policy([{ kind: 'skill', hash: SKILL_A }], 'arm-a').ok).toBe(true);
    expect(fleet.policy([{ kind: 'skill', hash: SKILL_B }], 'arm-a').ok).toBe(true);

    const policyEvents = () => events.filter((event) => event.event === 'policy').length;
    const eventCount = policyEvents();

    expect(fleet.policy([{ kind: 'skill', hash: SCENE }], 'arm-a').ok).toBe(false);
    available.delete(SKILL_A);
    expect(fleet.rollBack('arm-a').ok).toBe(false);
    expect(fleet.state('arm-a')).toMatchObject({ version: SKILL_B, previous: SKILL_A });
    expect(placedHash(spawned[0])).toBe(bytesHash(SKILL_B));
    expect(policyEvents()).toBe(eventCount);

    available.add(SKILL_A);
    expect(fleet.rollBack('arm-a').ok).toBe(true);
    expect(placedHash(spawned[0])).toBe(bytesHash(SKILL_A));
  });

  it('keeps a policy and its history when saving the next policy fails', () => {
    const { fleet, spawned } = fakeFleet({ policyBytes: skillBytes });

    connectAll(fleet, ['arm-a']);
    fleet.policy([{ kind: 'skill', hash: SKILL_A }], 'arm-a');

    const staged = path.join(artefactsOf(spawned[0]), 'policy.onnx.part');

    fs.mkdirSync(staged);
    expect(fleet.policy([{ kind: 'skill', hash: SKILL_B }], 'arm-a').ok).toBe(false);
    expect(fleet.state('arm-a')).toMatchObject({ version: SKILL_A, previous: null });
    expect(placedHash(spawned[0])).toBe(bytesHash(SKILL_A));
    fs.rmdirSync(staged);
  });
});

describe('robot fleet connection lifetime', () => {
  it('cleans up only a lost unit and reconnects with its original seed', async () => {
    const { fleet, spawned, events } = fakeFleet({ policyBytes: skillBytes });

    connectAll(fleet, ARMS);
    await climbToTest(spawned);
    fleet.policy([{ kind: 'skill', hash: SKILL_A }], 'arm-b');

    const lost = spawned[1];
    const firstSeed = seedOf(lost);

    lost.child.emit('exit', 1);
    expect(fs.existsSync(artefactsOf(lost))).toBe(false);
    expect(fleet.units().map((state) => [state.unit, state.mode])).toEqual([
      ['arm-a', 'test'],
      ['arm-c', 'test'],
    ]);
    expect(events.at(-1)).toMatchObject({ event: 'link', unit: 'arm-b', state: 'lost' });
    expect(fleet.command({ cmd: 'intent', joints: [0.4, -0.2] }, 'arm-b').ok).toBe(false);
    expect(fleet.connect(ARM, 'arm-b')).toEqual({ ok: true });
    expect(seedOf(spawned[3])).toBe(firstSeed);
    expect(artefactsOf(spawned[3])).not.toBe(artefactsOf(lost));
    expect(fleet.state('arm-b')).toMatchObject({ mode: 'look', version: null, previous: null });

    lost.child.say({ event: 'mode', mode: 'policy' });
    expect(fleet.state('arm-b').mode).toBe('look');
    expect(events.filter((event) => event.event === 'link' && event.state === 'connected')).toHaveLength(4);
  });

  it('waits for a stopped unit to exit and leaves every other unit driving', async () => {
    const { fleet, spawned, events } = fakeFleet();

    connectAll(fleet, ARMS);
    await climbToTest(spawned);
    expect(fleet.disconnect('arm-b')).toEqual({ ok: true });
    expect(fleet.connect(ARM, 'arm-b').ok).toBe(false);
    spawned[1].child.emit('exit', 0);

    expect(events.at(-1)).toMatchObject({ event: 'link', unit: 'arm-b', state: 'closed' });
    expect(fleet.state('arm-b')).toMatchObject({ connected: false, unit: 'arm-b' });
    expect(fleet.command({ cmd: 'intent', joints: [0.6, -0.2] }, 'arm-a').ok).toBe(true);
    expect(fleet.command({ cmd: 'intent', joints: [-0.3, 0.7] }, 'arm-c').ok).toBe(true);
    await settle(80);
    expect(spawned[0].child.sent.at(-1)).toEqual({ cmd: 'intent', joints: [0.6, -0.2] });
    expect(spawned[2].child.sent.at(-1)).toEqual({ cmd: 'intent', joints: [-0.3, 0.7] });
  });
});

describe('robot fleet limits', () => {
  it('refuses a 33rd arm, a bad name and a name already connected', () => {
    const { fleet, spawned } = fakeFleet();

    connectAll(
      fleet,
      Array.from({ length: MAX_UNITS }, (_, k) => `arm-${k}`),
    );

    expect(fleet.connect(ARM, 'arm-32')).toEqual({
      ok: false,
      message: 'Disconnect a robot first: a fleet runs at most 32.',
    });
    expect(fleet.connect(ARM, 'arm-0')).toEqual({
      ok: false,
      message: 'An emulated robot is connected. Disconnect it first.',
    });

    for (const name of ['Arm', '-arm', 'arm/../x', 'a'.repeat(33), 7, {}])
      expect(fleet.connect(ARM, name), String(name)).toEqual({
        ok: false,
        message: 'The robot only takes the documented commands.',
      });

    expect(spawned).toHaveLength(MAX_UNITS);
  });
});
