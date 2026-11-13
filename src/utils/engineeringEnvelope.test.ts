import { describe, expect, it } from 'vitest';
import { actuatorOf } from '../data/components';
import { engineeringFindings } from '../readiness/findings';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { actuatorOptions } from './actuatorCatalog';
import { ratingAt } from './actuatorRules';
import { servoUp } from './actuatorSizing';
import { servoLookup } from './engineeringEnvelope';
import { peakRow } from './engineeringPeak';
import type { JointLoad, WalkJoint, WalkSim } from './engineeringTypes';
import { TorqueRecorder, jointSamples, outsideEnvelope, servoCurve } from './peakTorque';

const VOLTS = 7.4;
const STS3215 = actuatorOf('feetech-sts3215', 'c001')!;
const CURVE = servoCurve(STS3215, VOLTS)!;
const WINDOWS = 200;

const knee: RobotJoint = {
  id: 'knee',
  name: 'Left knee',
  type: 'revolute',
  parent: ['thigh'],
  child: ['shin'],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  actuators: ['servo'],
  limb: 'leg',
};

const servoPart = {
  id: 'servo',
  name: 'Feetech STS3215',
  componentId: 'feetech-sts3215',
  componentVariant: 'c001',
} as ScenePart;

const load: JointLoad = {
  joint: knee,
  massG: 300,
  swingNm: 0.2,
  stanceNm: 0.4,
  loadNm: 0.4,
  kind: 'stance',
  stallNm: CURVE.stallNm,
  ratedNm: CURVE.ratedNm,
  volts: VOLTS,
  noLoadRpm: CURVE.rpm,
  status: 'pass',
};

const trace = (fast: number, rpmShare: number): Array<[number, number]> =>
  Array.from({ length: WINDOWS }, (_, i) =>
    i < WINDOWS * fast ? [rpmShare * CURVE.rpm, 0.7 * CURVE.stallNm] : [0.05 * CURVE.rpm, 0.2 * CURVE.stallNm],
  );

const walkOf = (samples: Array<[number, number]>): WalkSim => {
  const joint: WalkJoint = { p99Nm: 0.7 * CURVE.stallNm, rmsNm: 0.3, overS: 0, samples };

  return { policy: 'Walk', seconds: 14, fellAt: null, joints: { knee: joint } };
};

const peakOf = (samples: Array<[number, number]>) =>
  peakRow([load], DEFAULT_PROJECT, walkOf(samples), servoLookup(new Map([['servo', servoPart]])))[0];

describe('Torque–speed envelope', () => {
  it('flags a walk with half its windows at 0.7 × stall and 0.8 × no-load speed', () => {
    expect(outsideEnvelope(trace(0.5, 0.8), CURVE)).toBeCloseTo(0.5, 9);

    const row = peakOf(trace(0.5, 0.8));

    expect(row.status).toBe('warn');
    expect(row.items?.[0].text).toMatch(/^Left knee: .*, 50% of the walk past its torque–speed line$/);
    expect(row.envelopes?.[0]).toMatchObject({ joint: 'knee', label: 'Left knee', outside: 0.5 });
  });

  it('passes a slow walk at the same torque', () => {
    expect(outsideEnvelope(trace(0.5, 0.2), CURVE)).toBe(0);

    const row = peakOf(trace(0.5, 0.2));

    expect(row.status).toBe('pass');
    expect(row.items).toEqual([]);
    expect(row.envelopes?.[0].outside).toBe(0);
  });

  it('counts only windows where the servo drives, not where it brakes', () => {
    const braking = trace(0.5, 0.8).map(([rpm, nm]): [number, number] => [-rpm, nm]);

    expect(outsideEnvelope(braking, CURVE)).toBeCloseTo(0, 9);
    expect(outsideEnvelope([[0.8 * CURVE.rpm, 0.7 * CURVE.stallNm]], CURVE)).toBe(1);
  });

  it('allows 5% of the walk past the line before it warns', () => {
    expect(peakOf(trace(0.05, 0.8)).status).toBe('pass');
    expect(peakOf(trace(0.06, 0.8)).status).toBe('warn');
  });

  it('draws the catalog’s next servo up beside the joint’s own', () => {
    const up = servoUp(STS3215, VOLTS)!;
    const stall = (key: string) => ratingAt(actuatorOptions().find((o) => o.key === key)!.act, VOLTS).stallNm;
    const stronger = actuatorOptions().filter(
      (o) => o.bus === 'feetech' && o.act.volts[1] >= VOLTS && stall(o.key) > CURVE.stallNm * 1.05,
    );

    expect(up.key).toBe('component:feetech-sts3215|c044');
    expect(Math.min(...stronger.map((o) => stall(o.key)))).toBeCloseTo(stall(up.key), 9);

    const envelope = peakOf(trace(0.5, 0.8)).envelopes![0];

    expect(envelope.servo).toMatchObject({ name: 'Feetech STS3215', rpm: CURVE.rpm, stallNm: CURVE.stallNm });
    expect(envelope.up).toMatchObject({ name: up.name, stallNm: servoCurve(up.act, VOLTS)!.stallNm });
  });

  it('names the joint past its line in the agent’s check output', () => {
    const findings = engineeringFindings({
      rows: [peakOf(trace(0.5, 0.8))],
      joints: [load],
      massG: 1000,
      com: [0, 0, 0],
      masses: [],
    });

    expect(findings[0].agentText).toMatch(/^Peak torque: Left knee: .*50% of the walk past its torque–speed line/);
  });

  it('records each window’s speed with its torque, in rpm and N·m', () => {
    const dt = 0.005;
    const recorder = new TorqueRecorder(1, dt);
    const radS = 2;

    for (let i = 0; i < 40; i++) recorder.add([0.5], [0.5], [radS]);

    const samples = jointSamples(recorder.series(), 0, 0);

    expect(samples).toHaveLength(8);
    expect(samples[0][0]).toBeCloseTo((radS * 60) / (2 * Math.PI), 1);
    expect(samples[0][1]).toBeCloseTo(0.5, 9);
  });
});
