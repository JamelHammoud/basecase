import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { emulatedHorn, linkRadians, MAX_HORN_OFFSET_COUNTS } from './emulatedHorns.mjs';
import { linkWithFake } from './robotLinkFake.mjs';
import { checkedMounts, emulatedCalibration, jointRadians } from './robotSpec.mjs';

const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
const ROS2_ARM = {
  family: 'ros2',
  emulated: true,
  controller: { kind: 'forward_position', topic: '/forward_position_controller/commands' },
  joints: ['shoulder_pan_joint', 'elbow_joint'],
};
const UNDOCUMENTED = { ok: false, message: 'The robot only takes the documented commands.' };
const REVERSED_HORN = { offsetCounts: 136, direction: -1 };
const CENTERED = [
  { id: 1, zero_counts: 2048, direction: 1 },
  { id: 2, zero_counts: 2048, direction: 1 },
];

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const artefactsOf = (spawned) => {
  const { args } = spawned.at(-1);

  return args[args.indexOf('--artefacts') + 1];
};

const calibrationFile = (spawned) =>
  JSON.parse(fs.readFileSync(path.join(artefactsOf(spawned), 'calibration.json'), 'utf8'));

const statusOf = (joints) => ({ event: 'status', mode: 'look', run: 'idle', joints });

describe('emulated horns', () => {
  it('mounts each servo id the same way every time, within half a tooth, some reversed', () => {
    const horns = Array.from({ length: 32 }, (_, k) => emulatedHorn(k + 1));

    expect(horns).toEqual(Array.from({ length: 32 }, (_, k) => emulatedHorn(k + 1)));

    for (const { offsetCounts, direction } of horns) {
      expect(Number.isInteger(offsetCounts)).toBe(true);
      expect(Math.abs(offsetCounts)).toBeLessThanOrEqual(MAX_HORN_OFFSET_COUNTS);
      expect([1, -1]).toContain(direction);
    }

    expect(horns.some((horn) => horn.direction === -1)).toBe(true);
    expect(new Set(horns.map((horn) => horn.offsetCounts)).size).toBeGreaterThan(16);
  });

  it('reads the link angle the true calibration of the horn reads', () => {
    const horn = emulatedHorn(3);
    const truth = { zero_counts: 2048 + horn.offsetCounts, direction: horn.direction };

    for (const counts of [0, 1500, 2048, 3000, 4095])
      expect(linkRadians(counts, horn)).toBe(jointRadians(counts, truth));

    expect(linkRadians(2048 + 136 + 1024, REVERSED_HORN)).toBe(-Math.PI / 2);
  });
});

describe('robot link calibration', () => {
  it('sends the calibration right after connect and keeps it in state', () => {
    const { link, events } = linkWithFake();

    expect(link.state().calibration).toBeNull();
    link.connect(ARM);
    expect(events.map((e) => e.event)).toEqual(['link', 'calibration']);
    expect(events[1]).toEqual({ event: 'calibration', joints: CENTERED });
    expect(link.state().calibration).toEqual(CENTERED);
    link.disconnect();
  });

  it('adds each joint true link angle to status for an emulated servo robot', async () => {
    const { link, spawned, events } = linkWithFake({ hornFor: () => REVERSED_HORN });

    link.connect(ARM);
    spawned[0].child.say(
      statusOf([
        { id: 1, position: 2048 + 136 + 1024 },
        { id: 2, position: null },
        { id: null, position: 2048 },
      ]),
    );
    await settle();

    const status = events.at(-1);

    expect(status.joints.map((j) => j.link_rad)).toEqual([-Math.PI / 2, null, null]);
    expect(link.state().status).toEqual(status);
    link.disconnect();
  });

  it('leaves a ROS 2 robot status untouched and sends it no calibration', async () => {
    const { link, spawned, events } = linkWithFake({ hornFor: () => REVERSED_HORN });

    link.connect(ROS2_ARM);
    spawned[0].child.say(statusOf([{ id: 1, position: 3000 }]));
    await settle();
    expect(events.map((e) => e.event)).toEqual(['link', 'take', 'status']);
    expect(events.at(-1).joints[0]).toEqual({ id: 1, position: 3000 });
    expect(link.state().calibration).toBeNull();
    expect(link.calibrate([{ id: 1, zero_counts: 2048, direction: 1 }])).toEqual(UNDOCUMENTED);
    link.disconnect();
  });

  it('rewrites calibration.json with the new zero and direction, keeping names and ranges, then rechecks', async () => {
    const { link, spawned, events } = linkWithFake();
    const mount = { id: 2, zero_counts: 2184, direction: -1 };

    link.connect(ARM);
    expect(link.calibrate([mount])).toEqual({ ok: true });

    const [first, second] = emulatedCalibration(ARM).joints;

    expect(calibrationFile(spawned)).toEqual({ class: 'arm', joints: [first, { ...second, ...mount }] });
    expect(fs.readdirSync(artefactsOf(spawned))).toEqual(['calibration.json']);
    expect(events.at(-1)).toEqual({ event: 'calibration', joints: [CENTERED[0], mount] });
    expect(link.state().calibration).toEqual([CENTERED[0], mount]);
    await settle();
    expect(spawned[0].child.sent.filter((c) => c.cmd === 'recheck')).toHaveLength(1);
    link.disconnect();
  });

  it('holds the measured pose through the calibration in force', async () => {
    const { link, spawned } = linkWithFake();

    link.connect(ARM);
    link.calibrate([{ id: 1, zero_counts: 2184, direction: -1 }]);

    const { child } = spawned[0];

    child.say(
      statusOf([
        { id: 1, position: 2184 + 1024 },
        { id: 2, position: 2048 },
      ]),
    );
    child.say({ event: 'mode', mode: 'test' });
    await settle(80);

    const [shoulder, elbow] = child.sent.at(-1).joints;

    expect(shoulder).toBeCloseTo(-Math.PI / 2, 12);
    expect(elbow).toBe(0);
    link.disconnect();
  });

  it('refuses any other calibration ask, and any before connect', () => {
    const { link, spawned, events } = linkWithFake();
    const good = { id: 1, zero_counts: 2048, direction: 1 };

    expect(link.calibrate([good])).toEqual({ ok: false, message: 'Connect an emulated robot first.' });
    link.connect(ARM);

    const asks = [
      [{ ...good, zero_counts: 4096 }],
      [{ ...good, zero_counts: -1 }],
      [{ ...good, zero_counts: 1.5 }],
      [{ ...good, zero_counts: '2048' }],
      [{ ...good, direction: 0 }],
      [{ ...good, direction: 2 }],
      [{ ...good, id: 3 }],
      [good, good],
      [{ ...good, name: 'servo 1' }],
      [{ id: 1, zero_counts: 2048 }],
      [Object.assign(Object.create({ direction: 1 }), { id: 1, zero_counts: 2048 })],
      [],
      good,
      null,
      Object.assign(Object.create([good]), { length: 1 }),
    ];

    for (const ask of asks) {
      expect(link.calibrate(ask), JSON.stringify(ask)).toEqual(UNDOCUMENTED);
      expect(checkedMounts(ask, ARM), JSON.stringify(ask)).toBeNull();
    }

    expect(calibrationFile(spawned)).toEqual(emulatedCalibration(ARM));
    expect(events.filter((e) => e.event === 'calibration')).toHaveLength(1);
    link.disconnect();
  });
});
