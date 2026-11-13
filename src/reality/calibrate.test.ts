import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildMjcf } from '../sim/mjcf';
import { BAM_STS3215_7V4 } from '../data/servoFits';
import { actuatorOf } from '../data/components';
import { fitDynamics } from '../sim/servoModel';
import { BENCH_JOINT, benchInput } from './bench';
import { calibratedInput, calibrateServo } from './calibrate';
import { predictLog, type FitContext } from './fitServo';
import { estimatedFit, presetServo } from './servoEstimate';
import { scaledFit, type ServoScales } from './servoParams';
import { FAMILY_SERVOS } from './servoPart';
import type { BenchPayload, ServoCalibration, ServoLog, ServoPart } from './types';

const DT = 0.01;
const TICKS = 400;
const PAYLOADS: BenchPayload[] = [
  { massKg: 0.1, armM: 0.1 },
  { massKg: 0.3, armM: 0.12 },
];
const COUNT = (2 * Math.PI) / 4096;
const STS = FAMILY_SERVOS.sts3215;
const C046: ServoPart = { componentId: 'feetech-sts3215', variant: 'c046' };
const XL430: ServoPart = { componentId: 'dynamixel-xl430-w250' };

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

function recorded(scales: ServoScales, servo: ServoPart = STS): ServoLog[] {
  const ctx: FitContext = { mj, servo, preset: presetServo(servo) };
  const fit = scaledFit(ctx.preset.fit, scales);

  return PAYLOADS.flatMap((payload, k) =>
    [steps(k), multisine(k)].map((goalRad) => {
      const blank: ServoLog = {
        servo,
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
    const c = await calibrateServo({ servo: STS, logs: recorded(truth), mj });

    expect(c.verdict).toBe('measured');
    expect(c.scales.gain).toBeGreaterThan(1.4 * 0.85);
    expect(c.scales.gain).toBeLessThan(1.4 * 1.15);
    expect(c.scales.delay).toBeGreaterThan(2.5 * 0.75);
    expect(c.scales.delay).toBeLessThan(2.5 * 1.25);
    expect(c.evidence.gain).toBeGreaterThan(0.5);
  }, 60_000);

  it('reads logs from the preset itself as consistent', async () => {
    const c = await calibrateServo({ servo: STS, logs: recorded({}), mj });

    expect(c.verdict).toBe('consistent');
    expect(c.fit).toEqual(presetServo(STS).fit);
  }, 60_000);

  it('can’t tell from logs whose positions were shuffled in time', async () => {
    const logs = recorded({ gain: Math.log(1.4) }).map(reversedBlocks);
    const c = await calibrateServo({ servo: STS, logs, mj });

    expect(c.verdict).toBe('cant-tell');
    expect(c.rung).toBe('preset');
  }, 60_000);

  it('can’t tell from one log or a log from another servo', async () => {
    const logs = recorded({});

    expect((await calibrateServo({ servo: STS, logs: logs.slice(0, 1), mj })).verdict).toBe('cant-tell');
    expect((await calibrateServo({ servo: C046, logs, mj })).evidence.reason).toMatch(/not a feetech-sts3215 c046/);
  }, 60_000);

  it('still takes a request named by family, as old callers and the hidden twin send it', async () => {
    const logs = recorded({}).map(({ servo: _servo, ...log }) => ({ ...log, family: 'sts3215' as const }));
    const c = await calibrateServo({ family: 'sts3215', logs, mj });

    expect(c.verdict).toBe('consistent');
    expect(c).toMatchObject({ servo: STS });
  }, 60_000);
});

describe('calibrating any catalog servo', () => {
  it('starts an STS3215 C046 from its own model, not the C001’s', () => {
    const c046 = presetServo(C046);
    const spec = actuatorOf(C046.componentId, C046.variant)!;
    const force = (preset: { fit: typeof c046.fit; volts: number }) => fitDynamics(preset.fit, preset.volts, 0).forceNm;

    expect(c046.fit).toEqual(estimatedFit(spec));
    expect(c046.fit).not.toEqual(BAM_STS3215_7V4);
    expect(force(c046) / force(presetServo(STS))).toBeCloseTo(
      spec.stallNm / actuatorOf(STS.componentId, 'c001')!.stallNm,
      6,
    );
  });

  it('keeps the measured model for the servo it was measured on', () => {
    expect(estimatedFit(actuatorOf(STS.componentId, STS.variant)!)).toMatchObject({
      kt: BAM_STS3215_7V4.kt,
      resistance: BAM_STS3215_7V4.resistance,
      armature: BAM_STS3215_7V4.armature,
    });
  });

  it('measures an XL430 unit with planted parameters against its estimated model', async () => {
    const truth = { gain: Math.log(1.5), damping: Math.log(1.6), friction: Math.log(2) };
    const c = await calibrateServo({ servo: XL430, logs: recorded(truth, XL430), mj });

    expect(c.verdict).toBe('measured');
    expect(c).toMatchObject({ servo: XL430 });
    expect(c.evidence.gain).toBeGreaterThan(0.25);
  }, 60_000);

  it('can’t tell from an XL430’s shuffled logs', async () => {
    const logs = recorded({ gain: Math.log(1.5) }, XL430).map(reversedBlocks);
    const c = await calibrateServo({ servo: XL430, logs, mj });

    expect(c.verdict).toBe('cant-tell');
    expect(c.rung).toBe('preset');
  }, 60_000);
});

describe('calibratedInput', () => {
  const kpOf = (xml: string) => Number(/<position [^>]*kp="([^"]+)"/.exec(xml)?.[1]);
  const preset = presetServo(STS);
  const calibration = (verdict: ServoCalibration['verdict'], servo: ServoPart): ServoCalibration => ({
    verdict,
    servo,
    version: 1,
    rung: 'response',
    fit: scaledFit(preset.fit, { gain: Math.log(2) }),
    volts: preset.volts,
    scales: { gain: 2 },
    conditions: { volts: 7.4, temperatureC: 30 },
    evidence: { logs: 4, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.99, reason: '' },
  });
  const input = benchInput(STS, PAYLOADS[0]);
  const base = kpOf(buildMjcf(input).xml);

  it('applies a measured calibration to its joint', () => {
    const kp = kpOf(buildMjcf(calibratedInput(input, { [BENCH_JOINT]: calibration('measured', STS) })).xml);

    expect(kp).toBeCloseTo(base * 2, 3);
  });

  it('ignores calibrations that aren’t measured, or are for another servo or joint', () => {
    expect(calibratedInput(input, { [BENCH_JOINT]: calibration('consistent', STS) })).toBe(input);
    expect(calibratedInput(input, { [BENCH_JOINT]: calibration('measured', C046) })).toBe(input);
    expect(calibratedInput(input, { elbow: calibration('measured', STS) })).toBe(input);
  });
});
