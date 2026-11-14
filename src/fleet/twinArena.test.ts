import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { DEFAULT_UNIT } from '../../electron/robot/units.mjs';
import { unitHistories, withCalibration } from '../reality/projectCalibrations';
import { presetServo } from '../reality/servoEstimate';
import { scaledFit, type ServoScales } from '../reality/servoParams';
import { FAMILY_SERVOS } from '../reality/servoPart';
import type { ServoCalibration } from '../reality/types';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { servoArm } from '../sim/fixtures/servoArm';
import { buildMjcf } from '../sim/mjcf';
import type { MjcfInput } from '../sim/mjcfTypes';
import { modelHashes, type ArenaEvidence, type ArenaVariantResult } from '../skills/artifacts';
import type { Contract } from '../skills/contract';
import { policyObservation, type Environment } from '../skills/environment';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import type { SkillRecord } from '../skills/skillRecords';
import { proveOnTwin, twinModel, twinVerdict, withTwins, type TwinVerdict } from './twinArena';

const arm = servoArm(() => 'c001');
const project: ProjectSettings = { ...DEFAULT_PROJECT, joints: arm.joints };
const input: MjcfInput = {
  parts: arm.parts,
  rig: buildRig(arm.joints, arm.parts),
  project,
  measures: fixtureMeasures(arm.parts),
  partTriangles: fixtureTriangles(arm.parts),
};
const preset = presetServo(FAMILY_SERVOS.sts3215);

const measured = (scales: ServoScales): ServoCalibration => ({
  verdict: 'measured',
  servo: FAMILY_SERVOS.sts3215,
  version: 1,
  rung: 'response',
  fit: scaledFit(preset.fit, scales),
  volts: preset.volts,
  scales: Object.fromEntries(Object.entries(scales).map(([k, v]) => [k, Math.exp(v ?? 0)])),
  conditions: { volts: preset.volts, temperatureC: 25 },
  evidence: { logs: 6, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.9, reason: '' },
});

const SAG_RAD = 0.15;
const sag = (cmp: '<' | '>') => ({
  atom: { expr: { abs: { delta: { signal: 'shoulder' } } }, cmp, value: SAG_RAD, scale: SAG_RAD },
});
const holds: Contract = {
  version: 1,
  success: { always: { window: 'whole', state: sag('<') } },
  failures: [{ label: 'Shoulder sags', formula: { eventually: { window: 'whole', state: sag('>') } } }],
};
const POSE = { arm0: 60, arm1: 0 };

function holdEnvironment(robot: string): Environment {
  return {
    version: 1,
    robot,
    horizonS: 0.5,
    traceDt: 0.02,
    observation: policyObservation(['arm0', 'arm1', 'arm2']),
    action: { kind: 'position-offset', joints: ['arm0', 'arm1', 'arm2'], scale: 0.25, controlDt: 0.02 },
    reset: { pose: { values: POSE }, jointNoiseDeg: 1, baseYawDeg: 0, baseOffsetMm: 0 },
    randomization: { friction: [1, 1], mass: [1, 1], strength: [1, 1], latencyMs: [0, 0] },
    reward: { kind: 'contract-robustness' },
    contract: holds,
    signals: { shoulder: { kind: 'joint-position', joint: 'arm0' } },
  };
}

const skill = { controller: { kind: 'hold' as const, values: POSE } };
const salt = new Uint8Array(32).fill(11);
const UNITS = [DEFAULT_UNIT, 'arm-1', 'arm-2', 'arm-3'];
const fleet = withCalibration(
  withCalibration(project, 'arm0', measured({ gain: Math.log(0.9) }), 'arm-2'),
  'arm0',
  measured({ force: Math.log(0.1) }),
  'arm-3',
);

describe('twins on real WASM MuJoCo', () => {
  it('builds the scene’s own model for a unit with no calibration of its own', () => {
    const own = twinModel(input, unitHistories(fleet, DEFAULT_UNIT));
    const weak = twinModel(input, unitHistories(fleet, 'arm-3'));

    expect(own.xml).toBe(buildMjcf(input).xml);
    expect(twinModel(input, unitHistories(fleet, 'arm-1')).xml).toBe(own.xml);
    expect(modelHashes(weak).actuators).not.toBe(modelHashes(own).actuators);
  });

  it('fails only the unit with a weak shoulder, naming the sag, and the same salt gives the same verdicts', async () => {
    const mj = await loadMujoco();
    const verdicts = async () => {
      const out = [];

      for (const unit of UNITS) {
        const model = twinModel(input, unitHistories(fleet, unit));
        const environment = holdEnvironment(model.robots[0].key);

        out.push(twinVerdict(unit, await proveOnTwin({ mj, model, skill, environment, salt })));
      }

      return out;
    };
    const first = await verdicts();

    expect(first.map((v) => [v.unit, v.passed])).toEqual([
      [DEFAULT_UNIT, true],
      ['arm-1', true],
      ['arm-2', true],
      ['arm-3', false],
    ]);
    expect(first[3]).toMatchObject({ trials: 32, line: 'Shoulder sags' });
    expect(first[3].passes).toBeLessThan(29);
    expect(first[0].line).toMatch(/^\d+ of 32 tries, at least \d+%$/);
    expect(await verdicts()).toEqual(first);
  }, 20_000);
});

const variant = (passes: number, failures: Record<string, number> = {}): ArenaVariantResult => ({
  variant: 'held-out',
  trials: 32,
  passes,
  lowerBound: passes / 40,
  diverged: 0,
  failures,
});

const evidence = (variants: ArenaVariantResult[], passed: boolean): ArenaEvidence => ({
  arenaVersion: 1,
  binding: { contract: 'c', physics: 'p', actuators: 'a', environment: 'e' },
  confidence: 0.95,
  bar: 0.75,
  variants,
  lowerBound: Math.min(...variants.map((v) => v.lowerBound)),
  passed,
  conditions: [],
  summary: '',
  saltCommitment: 's',
});

describe('twinVerdict', () => {
  it('reads Arena’s line on a pass, with the worst variant’s counts', () => {
    expect(twinVerdict('arm-1', evidence([variant(32), variant(30)], true))).toEqual({
      unit: 'arm-1',
      passes: 30,
      trials: 32,
      passed: true,
      line: '30 of 32 tries, at least 75%',
    });
  });

  it('names the failure that failed most tries in the worst variant', () => {
    const worst = variant(10, { 'Drops the cup': 4, 'Shoulder sags': 18 });
    const verdict = twinVerdict('arm-3', evidence([variant(30, { 'Drops the cup': 2 }), worst], false));

    expect(verdict).toMatchObject({ passes: 10, trials: 32, passed: false, line: 'Shoulder sags' });
  });

  it('breaks a tie by name so the line never depends on order', () => {
    const tied = evidence([variant(20, { 'Tips over': 6, 'Drifts away': 6 })], false);

    expect(twinVerdict('arm-2', tied).line).toBe('Drifts away');
  });

  it('falls back to the refused line when no failure label fired', () => {
    expect(twinVerdict('arm-4', evidence([variant(12)], false)).line).toBe('Refused in Arena: 12 of 32 tries');
    expect(twinVerdict('arm-5', evidence([], false))).toEqual({
      unit: 'arm-5',
      passes: 0,
      trials: 0,
      passed: false,
      line: 'Refused in Arena',
    });
  });
});

describe('withTwins', () => {
  const verdict = (unit: string, passed: boolean): TwinVerdict => ({ unit, passes: 0, trials: 32, passed, line: unit });

  it('writes each unit’s latest verdict on the skill’s record and leaves the others', () => {
    const records = [{ hash: 'a' }, { hash: 'b' }] as SkillRecord[];
    const once = withTwins(records, 'a', { 'arm-1': verdict('arm-1', true), 'arm-2': verdict('arm-2', true) });
    const twice = withTwins(once, 'a', { 'arm-2': verdict('arm-2', false) });

    expect(twice[0].twins).toEqual({ 'arm-1': verdict('arm-1', true), 'arm-2': verdict('arm-2', false) });
    expect(twice[1]).toBe(records[1]);
  });
});
