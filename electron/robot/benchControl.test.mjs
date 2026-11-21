import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fleetWithFake } from './robotLinkFake.mjs';

const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
let rig;
let now;

function running(unit = 'arm-a') {
  const link = rig.fleet.entryOf(unit).link;
  const session = link.session;

  link.onLine(session, JSON.stringify({ event: 'hello', emulated: true }));
  link.onLine(
    session,
    JSON.stringify({
      event: 'status',
      mode: 'test',
      run: 'running',
      sealed: false,
      fault_latched: false,
      joints: [1, 2].map((id) => ({ id, position: 2048, torque_on: true, reply: 'ok' })),
    }),
  );
}

function claim(unit = 'arm-a', control = rig.fleet.state(unit).control) {
  return rig.fleet.command({ cmd: 'claim_control', control, seconds: 0.2 }, unit);
}

function intent(control, unit = 'arm-a') {
  return rig.fleet.command({ cmd: 'intent', joints: [0.02, -0.01], control }, unit);
}

beforeEach(() => {
  vi.useFakeTimers();
  now = 1000;
  rig = fleetWithFake({ clock: () => now });
  rig.fleet.connect(ARM, 'arm-a');
  rig.fleet.connect(ARM, 'arm-b');
  running();
  running('arm-b');
});

afterEach(() => {
  rig.fleet.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('connection-bound bench command ownership', () => {
  it('claims only one unit and refuses duplicate activation and another unit’s token', () => {
    const previous = rig.fleet.state('arm-a').control;
    const result = claim();

    expect(result.ok).toBe(true);
    expect(result.control).not.toEqual(previous);
    expect(claim().ok).toBe(false);
    expect(intent(result.control).ok).toBe(true);
    expect(intent(result.control, 'arm-b').ok).toBe(false);
    expect(rig.fleet.entryOf('arm-b').link.session.pipe).toBeDefined();
    expect(rig.fleet.state('arm-b').control).not.toEqual(result.control);
  });

  it('rejects a late command after the named unit reconnects', () => {
    const result = claim();
    const link = rig.fleet.entryOf('arm-a').link;

    link.disconnect();
    link.onExit(link.session, null);
    rig.fleet.connect(ARM, 'arm-a');
    running();

    expect(intent(result.control).ok).toBe(false);
    expect(rig.spawned.at(-1).child.sent.filter((command) => command.cmd === 'intent')).toEqual([]);
    expect(claim('arm-a', result.control).ok).toBe(false);
  });

  it.each(['stop', 'release', 'enter', 'intent'])('revokes ownership on a competing %s', (cmd) => {
    const result = claim();
    const command = { cmd };

    if (cmd === 'enter') command.mode = 'look';

    if (cmd === 'intent') command.joints = [0.1, 0.2];

    rig.fleet.command(command, 'arm-a');
    expect(intent(result.control).ok).toBe(false);
    expect(rig.spawned[0].child.sent).toContainEqual({ cmd: 'stop' });
    expect(rig.events).toContainEqual(expect.objectContaining({ event: 'control', unit: 'arm-a', held: false }));
  });

  it('stops at the bounded execution deadline without waiting for the renderer', async () => {
    const result = claim();

    expect(intent(result.control).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(intent(result.control).ok).toBe(false);
    expect(rig.spawned[0].child.sent).toContainEqual({ cmd: 'stop' });
    expect(rig.spawned[1].child.sent.some((command) => command.cmd === 'stop')).toBe(false);

    const count = rig.spawned[0].child.sent.filter((command) => command.cmd === 'intent').length;

    running();
    await vi.advanceTimersByTimeAsync(100);
    expect(rig.spawned[0].child.sent.filter((command) => command.cmd === 'intent')).toHaveLength(count);
    expect(claim().ok).toBe(false);
  });

  it('refuses missing, stale or unlocked telemetry and unsupported emulation', () => {
    const link = rig.fleet.entryOf('arm-a').link;
    const original = link.session.status;

    link.session.status = null;
    expect(claim().ok).toBe(false);
    link.session.status = { ...original, sealed: true };
    expect(claim().ok).toBe(false);
    link.session.status = { ...original, joints: [] };
    expect(claim().ok).toBe(false);
    link.session.status = original;
    now += 301;
    expect(claim().ok).toBe(false);
    running();
    link.session.hello.emulated = false;
    expect(claim().ok).toBe(false);
  });

  it.each(['calibration', 'fault', 'stopped'])('revokes a control token on %s', (event) => {
    const result = claim();
    const link = rig.fleet.entryOf('arm-a').link;

    if (event === 'calibration') link.calibrate([{ id: 1, zero_counts: 2049, direction: 1 }]);
    else link.onLine(link.session, JSON.stringify({ event }));

    expect(intent(result.control).ok).toBe(false);
  });

  it('stops an owned stream when telemetry becomes stale and rejects altered envelopes', () => {
    const result = claim();
    const link = rig.fleet.entryOf('arm-a').link;

    expect(intent({ ...result.control, extra: true }).ok).toBe(false);
    expect(rig.fleet.command({ cmd: 'enter', mode: 'test', control: result.control }, 'arm-a').ok).toBe(false);
    link.session.heardAt = now - 301;
    expect(intent(result.control).ok).toBe(false);
    expect(rig.spawned[0].child.sent).toContainEqual({ cmd: 'stop' });
    expect(intent(result.control).ok).toBe(false);
  });

  it('refuses an expired claim and nonfinite or excessive durations', () => {
    const old = rig.fleet.state('arm-a').control;
    const result = claim();

    rig.fleet.command({ cmd: 'stop', control: result.control }, 'arm-a');
    expect(claim('arm-a', old).ok).toBe(false);

    for (const seconds of [0, -1, 2.001, NaN, Infinity])
      expect(
        rig.fleet.command({ cmd: 'claim_control', control: rig.fleet.state('arm-a').control, seconds }, 'arm-a').ok,
      ).toBe(false);
  });
});
