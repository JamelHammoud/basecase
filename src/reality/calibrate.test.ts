import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildMjcf } from '../sim/mjcf';
import { BENCH_JOINT, benchInput, presetServo } from './bench';
import { calibratedInput, calibrateServo } from './calibrate';
import { predictLog, type FitContext } from './fitServo';
import { scaledFit, type ServoScales } from './servoParams';
import type { BenchPayload, ServoCalibration, ServoLog } from './types';

const DT = 0.01;
const TICKS = 400;
const PAYLOADS: BenchPayload[] = [
  { massKg: 0.1, armM: 0.1 },
  { massKg: 0.3, armM: 0.12 },
];
const COUNT = (2 * Math.PI) / 4096;

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const steps = (seed: number) =>
  Array.from({ length: TICKS }, (_, i) => 0.6 * Math.sin(seed + 1.7 * Math.floor((i * DT) / 0.8)));
const multisine = (seed: number) =>
  Array.from(
    { length: TICKS },
    (_, i) => 0.25 * Math.sin(2 * Math.PI * 0.7 * i * DT + seed) + 0.15 * Math.sin(2 * Math.PI * 2.1 * i * DT),
  );

function recorded(scales: ServoScales): ServoLog[] {
  const ctx: FitContext = { mj, family: 'sts3215', preset: presetServo('sts3215') };
  const fit = scaledFit(ctx.preset.fit, scales);

  return PAYLOADS.flatMap((payload, k) =>
    [steps(k), multisine(k)].map((goalRad) => {
      const blank: ServoLog = {
        family: 'sts3215',
        dt: DT,
        goalRad,
        positionRad: [0, ...goalRad.slice(1).map(() => 0)],
        loadRatio: goalRad.map(() => 0),
        volts: goalRad.map(() => 7.4),
        temperatureC: goalRad.map(() => 30),
        payload,
      };

      return { ...blank, positionRad: [...predictLog(ctx, fit, blank)].map((p) => Math.round(p / COUNT) * COUNT) };
    }),
  );
}

const reversedBlocks = (log: ServoLog): ServoLog => {
  const blocks = Array.from({ length: TICKS / 100 }, (_, b) => log.positionRad.slice(b * 100, b * 100 + 100));

  return { ...log, positionRad: blocks.reverse().flat() };
};

describe('calibrateServo', () => {
  it('measures a servo whose gain and delay differ from the preset', async () => {
    const truth = { gain: Math.log(1.4), delay: Math.log(2.5) };
    const c = await calibrateServo({ family: 'sts3215', logs: recorded(truth), mj });

    expect(c.verdict).toBe('measured');
    expect(c.scales.gain).toBeGreaterThan(1.4 * 0.85);
    expect(c.scales.gain).toBeLessThan(1.4 * 1.15);
    expect(c.scales.delay).toBeGreaterThan(2.5 * 0.75);
    expect(c.scales.delay).toBeLessThan(2.5 * 1.25);
    expect(c.evidence.gain).toBeGreaterThan(0.5);
  }, 60_000);

  it('reads logs from the preset itself as consistent', async () => {
    const c = await calibrateServo({ family: 'sts3215', logs: recorded({}), mj });

    expect(c.verdict).toBe('consistent');
    expect(c.fit).toEqual(presetServo('sts3215').fit);
  }, 60_000);

  it('can’t tell from logs whose positions were shuffled in time', async () => {
    const logs = recorded({ gain: Math.log(1.4) }).map(reversedBlocks);
    const c = await calibrateServo({ family: 'sts3215', logs, mj });

    expect(c.verdict).toBe('cant-tell');
    expect(c.rung).toBe('preset');
  }, 60_000);

  it('can’t tell from one log or a log from another servo', async () => {
    const logs = recorded({});

    expect((await calibrateServo({ family: 'sts3215', logs: logs.slice(0, 1), mj })).verdict).toBe('cant-tell');
    expect((await calibrateServo({ family: 'xl330', logs, mj })).evidence.reason).toMatch(/not a xl330/);
  }, 60_000);
});

describe('calibratedInput', () => {
  const kpOf = (xml: string) => Number(/<position [^>]*kp="([^"]+)"/.exec(xml)?.[1]);
  const preset = presetServo('sts3215');
  const calibration = (verdict: ServoCalibration['verdict'], family: ServoCalibration['family']): ServoCalibration => ({
    verdict,
    family,
    version: 1,
    rung: 'response',
    fit: scaledFit(preset.fit, { gain: Math.log(2) }),
    volts: preset.volts,
    scales: { gain: 2 },
    conditions: { volts: 7.4, temperatureC: 30 },
    evidence: { logs: 4, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.99, reason: '' },
  });
  const input = benchInput('sts3215', PAYLOADS[0]);
  const base = kpOf(buildMjcf(input).xml);

  it('applies a measured calibration to its joint', () => {
    const kp = kpOf(buildMjcf(calibratedInput(input, { [BENCH_JOINT]: calibration('measured', 'sts3215') })).xml);

    expect(kp).toBeCloseTo(base * 2, 3);
  });

  it('ignores calibrations that aren’t measured, or are for another servo or joint', () => {
    expect(calibratedInput(input, { [BENCH_JOINT]: calibration('consistent', 'sts3215') })).toBe(input);
    expect(calibratedInput(input, { [BENCH_JOINT]: calibration('measured', 'xl330') })).toBe(input);
    expect(calibratedInput(input, { elbow: calibration('measured', 'sts3215') })).toBe(input);
  });
});
