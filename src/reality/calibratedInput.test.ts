import { describe, expect, it } from 'vitest';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { servoArm } from '../sim/fixtures/servoArm';
import { buildMjcf } from '../sim/mjcf';
import type { MjcfInput } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { calibratedInput } from './calibratedInput';
import { EMPTY_HISTORY, recordCalibration, simCalibrations } from './history';
import { populationFit, populationFor } from './population';
import { FIXTURE_POPULATIONS } from './population.fixtures';
import { presetServo } from './servoEstimate';
import { scaledFit } from './servoParams';
import { FAMILY_SERVOS } from './servoPart';
import type { ServoCalibration } from './types';

const arm = servoArm(() => 'c001');
const input: MjcfInput = {
  parts: arm.parts,
  rig: buildRig(arm.joints, arm.parts),
  project: { ...DEFAULT_PROJECT, joints: arm.joints },
  measures: fixtureMeasures(arm.parts),
  partTriangles: fixtureTriangles(arm.parts),
};
const preset = presetServo(FAMILY_SERVOS.sts3215);
const population = populationFor(FIXTURE_POPULATIONS, FAMILY_SERVOS.sts3215, preset.volts)!;

const measured = (gain: number): ServoCalibration => ({
  verdict: 'measured',
  servo: FAMILY_SERVOS.sts3215,
  version: 1,
  rung: 'response',
  fit: scaledFit(preset.fit, { gain: Math.log(gain) }),
  volts: preset.volts,
  scales: { gain },
  conditions: { volts: preset.volts, temperatureC: 25 },
  evidence: { logs: 6, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.9, reason: '' },
});

const kpOf = (xml: string, joint: string) =>
  Number(new RegExp(`<position name="[^"]*${joint}"[^>]*kp="([^"]+)"`).exec(xml)?.[1]);

describe('the population median in the sim', () => {
  it('runs a joint with no calibration of its own on its servo’s population median', () => {
    const out = calibratedInput(input, {}, FIXTURE_POPULATIONS);

    for (const j of arm.joints) expect(out.servoFits?.[j.id]?.fit).toEqual(populationFit(population, preset.fit));

    expect(out.servoSpreads?.map((s) => s.joints)).toEqual([arm.joints.map((j) => j.id)]);
    expect(kpOf(buildMjcf(out).xml, 'arm0')).not.toBeCloseTo(kpOf(buildMjcf(input).xml, 'arm0'), 3);
  });

  it('always lets a joint’s own Measured calibration win over the population', () => {
    const own = measured(0.5);
    const out = calibratedInput(input, { arm1: own }, FIXTURE_POPULATIONS);

    expect(out.servoFits?.arm1).toEqual({ fit: own.fit, volts: own.volts });
    expect(out.servoSpreads?.flatMap((s) => s.joints)).not.toContain('arm1');
    expect(buildMjcf(out).servoSpreads?.flatMap((s) => s.joints)).toEqual(['arm0', 'arm2']);
  });

  it('keeps a joint whose bench read Consistent with preset on the catalog preset', () => {
    const bench: ServoCalibration = {
      ...measured(1),
      verdict: 'consistent',
      rung: 'preset',
      fit: preset.fit,
      scales: {},
    };
    const histories = { arm1: recordCalibration(EMPTY_HISTORY, bench) };
    const out = calibratedInput(input, simCalibrations(histories), FIXTURE_POPULATIONS);

    expect(histories.arm1.active).toBeNull();
    expect(out.servoFits?.arm1).toBeUndefined();
    expect(out.servoSpreads?.flatMap((s) => s.joints)).toEqual(['arm0', 'arm2']);
    expect(kpOf(buildMjcf(out).xml, 'arm1')).toBeCloseTo(kpOf(buildMjcf(input).xml, 'arm1'), 6);
  });

  it('keeps the catalog preset when no population is given', () => {
    expect(calibratedInput(input, {})).toBe(input);
  });

  it('keeps enough servo history for the slowest delay the spread draws', () => {
    const xml = buildMjcf(calibratedInput(input, {}, FIXTURE_POPULATIONS)).xml;
    const [, delay, samples] = /delay="([^"]+)" nsample="(\d+)"/.exec(xml)!.map(Number);

    expect(samples * 0.002).toBeGreaterThan(1.5 * delay);
  });
});
