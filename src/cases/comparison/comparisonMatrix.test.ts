import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { comparisonMatrix, matrixSource } from './comparisonMatrixFixtures';
import { alignmentOffset, differenceAt, prepareSource, sampleAt, sourceTime } from './comparison';
import { comparisonImageFrame, rawComparisonPixels } from './comparisonImages';
import { comparisonSpatialSession } from './comparisonSpatial';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const signal = 'topic./imu.angular_velocity.x';
const rule = { kind: 'previous' as const, maxAge: 0.25 };

describe('ten generated saved-run comparisons', () => {
  it.each(comparisonMatrix)('$scenario preserves alignment, source provenance and isolated evidence', async (spec) => {
    const aFile = await matrixSource(mj, spec, 0);
    const bFile = await matrixSource(mj, spec, 1);
    const original = [hash(aFile.bytes), hash(bFile.bytes)];
    const a = await prepareSource(aFile);
    const b = await prepareSource(bFile);

    expect([a.hash, b.hash]).toEqual(original);
    expect(a.stored).toEqual(aFile.stored);
    expect(b.stored).toEqual(bFile.stored);
    expect(sampleAt(a, signal, a.start + 1, rule).value).toBeCloseTo(spec.expected[0]);
    expect(sampleAt(b, signal, b.start + 1, rule).value).toBeCloseTo(spec.expected[1]);
    expect(sampleAt(a, signal, a.start, rule).value).toBeCloseTo(spec.a[0]);
    expect(sampleAt(b, signal, b.start, rule).value).toBeCloseTo(spec.b[0]);

    const slots = [
      { source: a, offset: -1 },
      { source: b, offset: -1 },
    ] as const;

    expect(sourceTime(a, 0, -1)).toBe(a.start + 1);
    expect(
      differenceAt(slots, 0, { left: signal, right: signal, leftUnit: 'rad/s', rightUnit: 'rad/s', rule }),
    ).toBeCloseTo(spec.expected[0] - spec.expected[1]);
    expect(
      differenceAt(slots, 0, { left: signal, right: signal, leftUnit: 'm/s', rightUnit: 'rad/s', rule }),
    ).toBeNull();
    expect(sampleAt(a, 'missing', a.start, rule).status).toBe('missing');
    expect([hash(aFile.bytes), hash(bFile.bytes)]).toEqual(original);

    if (spec.kind === 'states') {
      expect(a.recording.nq).toBe(0);
      expect(sampleAt(a, 'topic./mode.data', 1, rule).value).toBe('run');
      expect(sampleAt(b, 'topic./mode.data', 1, rule).value).toBe('trigger');
      expect(
        a.events.filter((event) => event.at === 1 && event.signal === 'topic./mode.data').map((event) => event.value),
      ).toEqual(['trigger', 'run']);
    }

    if (spec.robot && spec.kind !== 'states') expect(a.recording.nbody).toBeGreaterThan(0);

    const eventA = a.events.find((event) => event.name === 'trigger' || event.value === 'trigger')!;
    const eventB = b.events.find((event) => event.name === 'trigger' || event.value === 'trigger')!;
    const offsetA = alignmentOffset(a, eventA, 0);
    const offsetB = alignmentOffset(b, eventB, 0);

    expect(sourceTime(a, 0, offsetA)).toBe(eventA.at);
    expect(sourceTime(b, 0, offsetB)).toBe(eventB.at);
    expect(offsetA).toBe(-1);
    expect(offsetB).toBe(spec.kind === 'rates' ? -0.5 : -1);

    if (spec.kind === 'calibration' || spec.kind === 'payload')
      expect(a.stored.robot.modelHash).not.toBe(b.stored.robot.modelHash);

    if (spec.kind === 'emulated') expect([a.stored.source, b.stored.source]).toEqual(['case', 'operate']);

    if (spec.kind === 'camera') {
      const left = rawComparisonPixels(comparisonImageFrame(a, '/camera', 1, rule)!);
      const right = rawComparisonPixels(comparisonImageFrame(b, '/camera', 1, rule)!);

      expect([left.width, right.width]).toEqual([4, 2]);
      expect(Array.from(left.pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
      expect(Array.from(right.pixels.slice(0, 4))).toEqual([0, 255, 0, 255]);
    }

    if (spec.scenario.includes('missing intervals')) expect(sampleAt(a, signal, 105, rule).status).toBe('stale');

    if (spec.robot) expect(comparisonSpatialSession().read(a, '/scan', a.start + 1).frame).toBe('laser');
  });
});
