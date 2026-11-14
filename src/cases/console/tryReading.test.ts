import { describe, expect, it } from 'vitest';
import type { SignalTrack } from './recordedSignals';
import { captureTime, MAX_POINTS, rounded, tryReading } from './tryReading';

const DT = 0.02;

function plantedTrack(seconds: number, columns: Record<string, (t: number) => number>): SignalTrack {
  const t = Array.from({ length: Math.round(seconds / DT) + 1 }, (_, n) => Math.round(n * DT * 1000) / 1000);
  const numbers = new Map(Object.entries(columns).map(([id, at]) => [id, t.map(at)]));

  return { t, numbers: new Map([['time', t], ...numbers]), labels: new Map([['goal.failed', t.map(() => [])]]) };
}

const tilt = (t: number) => (t < 2 ? 0 : Math.min(90, (t - 2) * 160));

const fall = () =>
  plantedTrack(5, {
    'robot.tilt': tilt,
    'robot.height': (t) => (t < 2 ? 0 : -0.05 * (t - 2)),
    'joint.hip.position': (t) => 30 * Math.sin(t),
    'joint.knee.position': (t) => 20 * Math.cos(t),
    'joint.hip.effort': () => 0.4,
  });

const FELL = { label: 'fell', frame: 120 };

describe('tryReading', () => {
  it('returns the fell label at its time and the tilt crossing', () => {
    const reading = tryReading({ track: fall(), trips: [FELL], dt: DT, signals: ['robot.tilt'] });

    expect(reading.failures).toEqual([{ label: 'fell', at: 2.4, values: { 'robot.tilt': 64 } }]);
    expect(reading.signals['robot.tilt'].max).toEqual([90, 2.58]);
    expect(reading.signals['robot.tilt'].min).toEqual([0, 0]);
    expect(captureTime(reading, undefined)).toBeCloseTo(2.4, 6);
  });

  it('keeps each label’s first trip only', () => {
    const reading = tryReading({ track: fall(), trips: [FELL, { label: 'fell', frame: 200 }], dt: DT });

    expect(reading.failures.map((f) => f.at)).toEqual([2.4]);
  });

  it('clamps the window to the try', () => {
    const wide = tryReading({ track: fall(), trips: [], dt: DT, from: -3, to: 99, signals: ['robot.tilt'] });
    const backwards = tryReading({ track: fall(), trips: [], dt: DT, from: 4, to: 2, signals: ['robot.tilt'] });

    expect([wide.seconds, wide.from, wide.to, wide.t[0], wide.t.at(-1)]).toEqual([5, 0, 5, 0, 5]);
    expect([backwards.from, backwards.to, backwards.t]).toEqual([4, 4, [4]]);
  });

  it('reads min and max over every frame in the window, not just the samples', () => {
    const reading = tryReading({ track: fall(), trips: [], dt: DT, from: 1, to: 2.2, signals: ['robot.tilt'] });

    expect(reading.t[0]).toBe(1);
    expect(reading.t.at(-1)).toBeCloseTo(2.2, 6);
    expect(reading.signals['robot.tilt'].max).toEqual([32, 2.2]);
  });

  it('expands wildcards and reports patterns that match nothing', () => {
    const reading = tryReading({
      track: fall(),
      trips: [],
      dt: DT,
      signals: ['joint.*.position', 'joint.*.speed', 'goal.failed', 'robot.tilt'],
    });

    expect(Object.keys(reading.signals)).toEqual(['joint.hip.position', 'joint.knee.position', 'robot.tilt']);
    expect(reading.unknown).toEqual(['joint.*.speed']);
  });

  it('reads every number signal but time when none are named', () => {
    const reading = tryReading({ track: fall(), trips: [], dt: DT });

    expect(Object.keys(reading.signals)).toEqual([
      'robot.tilt',
      'robot.height',
      'joint.hip.position',
      'joint.knee.position',
      'joint.hip.effort',
    ]);
  });

  it('samples at most 200 points, never finer than a frame', () => {
    const long = tryReading({ track: plantedTrack(120, { 'robot.tilt': tilt }), trips: [], dt: DT });
    const short = tryReading({ track: plantedTrack(2, { 'robot.tilt': tilt }), trips: [], dt: DT });

    expect(long.t.length).toBeLessThanOrEqual(MAX_POINTS);
    expect(long.t.at(-1)).toBe(120);
    expect(long.step).toBeGreaterThan(DT);
    expect(short.step).toBeCloseTo(DT, 6);
    expect(short.t).toHaveLength(101);
  });

  it('keeps a two-minute try with 24 signals under 60 KB', () => {
    const columns = Object.fromEntries(
      Array.from({ length: 24 }, (_, i): [string, (t: number) => number] => [
        `joint.j${i}.position`,
        (t) => 123.456789 * Math.sin(t * (i + 1)) + Math.random(),
      ]),
    );
    const reading = tryReading({
      track: plantedTrack(120, columns),
      trips: [FELL],
      dt: DT,
      signals: ['joint.*.position'],
    });

    expect(Object.keys(reading.signals)).toHaveLength(24);
    expect(JSON.stringify(reading).length).toBeLessThan(60_000);
  });

  it('rounds to three significant digits, keeping whole numbers', () => {
    expect([rounded(61.234), rounded(0.0012345), rounded(1234.5), rounded(0)]).toEqual([61.2, 0.00123, 1235, 0]);
  });
});
