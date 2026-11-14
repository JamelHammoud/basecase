import { describe, expect, it } from 'vitest';
import type { RecordedTrack } from './recordedSignals';
import { MAX_ROWS, MAX_SIGNALS, tryAsk, tryReading } from './tryReading';

const DT = 0.02;
const FRAMES = 501;

function fakeTrack(columns: Record<string, (n: number) => number>): RecordedTrack {
  const filled = new Map(
    Object.entries(columns).map(([id, at]) => [id, Float64Array.from({ length: FRAMES }, (_, n) => at(n))]),
  );
  const clamp = (frame: number) => Math.max(0, Math.min(FRAMES - 1, Math.round(frame)));

  return {
    frames: FRAMES,
    dt: DT,
    ids: [...filled.keys()],
    time: (frame) => Math.fround(clamp(frame) * DT),
    frameAt: (seconds) => clamp(seconds / DT),
    values: () => new Map(),
    series: () => ({ t: [], v: [] }),
    column: (id) => filled.get(id) ?? null,
    goalAt: () => null,
  };
}

const track = fakeTrack({
  time: (n) => n * DT,
  'robot.tilt': (n) => n * 0.123456,
  'robot.height': () => -0.00001,
  'goal.passed': () => 0,
  'goal.margin': (n) => (n < 25 ? Number.NaN : -1.5),
  'joint.hip.position': (n) => n,
  'joint.knee.position': (n) => -n,
  'joint.hip.effort': () => 0.5,
});

describe('read_try payload', () => {
  it('reads the whole try at about 50 rows of robot.* and goal.* when nothing is asked', () => {
    const reading = tryReading(track, [], {});

    expect(reading.window).toEqual({ from: 0, to: 10, every: 0.2 });
    expect(Object.keys(reading.samples)).toEqual(['time', 'robot.tilt', 'robot.height', 'goal.passed', 'goal.margin']);
    expect(reading.samples.time).toHaveLength(51);
    expect(reading.samples.time.at(-1)).toBe(10);
    expect(reading.capture).toBe(10);
    expect(reading.unknown).toBeUndefined();
  });

  it('samples a window at the asked step, rounded to 3 decimals, with gaps as null', () => {
    const reading = tryReading(track, [], { from: 0.2, to: 1.2, every: 0.5, signals: ['robot.*', 'goal.margin'] });

    expect(reading.window).toEqual({ from: 0.2, to: 1.2, every: 0.5 });
    expect(reading.samples.time).toEqual([0.2, 0.7, 1.2]);
    expect(reading.samples['robot.tilt']).toEqual([1.235, 4.321, 7.407]);
    expect(reading.samples['robot.height']).toEqual([0, 0, 0]);
    expect(reading.samples['goal.margin']).toEqual([null, -1.5, -1.5]);
  });

  it('expands a wildcard over one name part only and names patterns that match nothing', () => {
    const reading = tryReading(track, [], { to: 1, signals: ['joint.*.position', 'probe.nope', 'joint.*'] });

    expect(Object.keys(reading.samples)).toEqual(['time', 'joint.hip.position', 'joint.knee.position']);
    expect(reading.unknown).toEqual(['probe.nope', 'joint.*']);
  });

  it('never returns more than the row cap, and always ends on the window’s end', () => {
    const reading = tryReading(track, [], { every: 0.02 });

    expect(reading.samples.time.length).toBeLessThanOrEqual(MAX_ROWS);
    expect(reading.samples.time.at(-1)).toBe(10);
    expect(reading.window).toMatchObject({ every: 0.06 });
  });

  it('lists failures by time, captures at the first unless asked, and clamps the window', () => {
    const trips = [
      { label: 'dropped', frame: 300 },
      { label: 'fell', frame: 120 },
    ];
    const reading = tryReading(track, trips, { from: 12, to: -3 });

    expect(reading.failures).toEqual([
      { label: 'fell', time: 2.4 },
      { label: 'dropped', time: 6 },
    ]);
    expect(reading).toMatchObject({ capture: 2.4, window: { from: 0, to: 10 } });
    expect(tryReading(track, trips, { at: 99 }).capture).toBe(10);
  });

  it('leaves out signals past the cap and says which', () => {
    const many = fakeTrack(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`joint.j${i}.position`, () => i])));
    const reading = tryReading(many, [], { signals: ['joint.*.position'] });

    expect(Object.keys(reading.samples)).toHaveLength(MAX_SIGNALS + 1);
    expect(reading.left_out).toHaveLength(40 - MAX_SIGNALS);
  });

  it('reads the agent’s arguments, dropping what isn’t a number or a name', () => {
    expect(tryAsk({ from: '1', to: 4, every: Number.NaN, at: 2, signals: ' robot.tilt ' })).toEqual({
      from: undefined,
      to: 4,
      every: undefined,
      at: 2,
      signals: ['robot.tilt'],
    });
    expect(tryAsk({ signals: ['', 3, 'goal.*'] }).signals).toEqual(['goal.*']);
    expect(tryAsk({}).signals).toBeUndefined();
  });
});
