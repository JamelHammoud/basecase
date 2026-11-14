import { describe, expect, it } from 'vitest';
import type { ConsoleSignal } from './format';
import { createSignalBus, type SignalSample, type SignalTrack, type SignalValue } from './signalBus';

const sample = (time: number, over: Partial<SignalSample> = {}): SignalSample => ({
  time,
  running: true,
  joints: [{ id: 'elbow', target: 30, position: 28, effort: 0.4 }],
  robot: { speed: 0.2, x: 10, z: -5 },
  probes: { bin: 100 },
  inputs: { keys: { v: [1, 0, -0.5], aux: [0, 1] }, gamepad: null },
  goal: { passed: false, margin: -3, failed: ['dropped it'] },
  cameras: ['scene', 'wrist_camera'],
  ...over,
});

const GAME: ConsoleSignal[] = [
  { id: 'clock', kind: 'timer', seconds: 10 },
  { id: 'binned', kind: 'counter', when: { signal: 'probe.bin', below: 30 } },
  {
    id: 'score',
    kind: 'score',
    sum: [
      { signal: 'binned', times: 10 },
      { signal: 'clock', times: 1 },
    ],
  },
];

describe('the signal bus', () => {
  it('names every joint, sensor, camera, input and goal signal from one sample', () => {
    const bus = createSignalBus();

    bus.push(sample(1));

    expect(bus.read('joint.elbow.target')).toBe(30);
    expect(bus.read('joint.elbow.position')).toBe(28);
    expect(bus.read('joint.elbow.effort')).toBeCloseTo(0.4);
    expect(bus.read('robot.speed')).toBeCloseTo(0.2);
    expect(bus.read('probe.bin')).toBe(100);
    expect(bus.read('input.keys.forward')).toBe(1);
    expect(bus.read('input.keys.turn')).toBe(-0.5);
    expect(bus.read('input.keys.grip')).toBe(1);
    expect(bus.read('input.gamepad.forward')).toBe(0);
    expect(bus.read('goal.failed')).toEqual(['dropped it']);
    expect(bus.read('goal.margin')).toBe(-3);
    expect(bus.expand('camera.*')).toEqual(['camera.scene', 'camera.wrist_camera']);
    expect(bus.expand('joint.*.position')).toEqual(['joint.elbow.position']);
  });

  it('runs a Case’s timer, counter and score only while a try runs, and starts them over with each try', () => {
    const bus = createSignalBus(GAME);

    expect(bus.read('clock')).toBe(10);
    expect(bus.read('score')).toBe(10);

    bus.push(sample(0, { running: false, probes: { bin: 10 } }));
    bus.push(sample(1, { running: false, probes: { bin: 100 } }));
    expect(bus.read('binned')).toBe(0);

    bus.push(sample(2));
    bus.push(sample(2.5, { probes: { bin: 20 } }));
    bus.push(sample(3, { probes: { bin: 25 } }));
    bus.push(sample(3.5, { probes: { bin: 90 } }));
    bus.push(sample(4, { probes: { bin: 5 } }));

    expect(bus.read('binned')).toBe(2);
    expect(bus.read('clock')).toBe(8);
    expect(bus.read('score')).toBe(28);

    bus.push(sample(5, { running: false }));
    bus.push(sample(6));

    expect(bus.read('binned')).toBe(0);
    expect(bus.read('clock')).toBe(10);
  });

  it('keeps each number’s history for plots, and Reset clears it with the Case’s signals', () => {
    const bus = createSignalBus(GAME);
    let heard = 0;
    const stop = bus.subscribe(() => heard++);

    for (let i = 0; i < 5; i++) bus.push(sample(i * 0.5, { probes: { bin: i % 2 ? 10 : 100 } }));

    expect(bus.series('joint.elbow.position').t).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(bus.read('binned')).toBe(2);

    bus.reset();
    stop();
    bus.push(sample(3));

    expect(heard).toBe(6);
    expect(bus.series('joint.elbow.position').t).toEqual([3]);
    expect(bus.read('binned')).toBe(0);
  });
});

describe('the signal bus playing a recording', () => {
  const frames = 5;
  const track: SignalTrack = {
    frames,
    dt: 0.5,
    time: (frame) => frame * 0.5,
    frameAt: (time) => Math.round(time / 0.5),
    values: (frame) =>
      new Map<string, SignalValue>([
        ['time', frame * 0.5],
        ['joint.elbow.position', frame * 10],
      ]),
    series: () => ({ t: [0, 0.5, 1, 1.5, 2], v: [0, 10, 20, 30, 40] }),
    column: () => Float64Array.from([0, 10, 20, 30, 40]),
  };

  it('reads the recording at the playhead in place of the live samples, then goes back to live', () => {
    const bus = createSignalBus();

    bus.push(sample(1));
    bus.play(track);
    bus.seek(3);

    expect(bus.playhead()?.frame).toBe(3);
    expect(bus.read('joint.elbow.position')).toBe(30);
    expect(bus.read('time')).toBe(1.5);
    expect(bus.series('joint.elbow.position').t).toHaveLength(frames);
    expect(bus.expand('joint.*.position')).toEqual(['joint.elbow.position']);

    bus.push(sample(2, { joints: [{ id: 'elbow', target: 0, position: 99, effort: 0 }] }));
    bus.seek(99);
    expect(bus.read('joint.elbow.position')).toBe(40);

    bus.play(null);

    expect(bus.playhead()).toBeNull();
    expect(bus.read('joint.elbow.position')).toBe(28);
    expect(bus.series('joint.elbow.position').t).toEqual([1]);
  });
});
