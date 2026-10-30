import { describe, expect, it } from 'vitest';
import { fastenersIn, measuresIn, sweepsIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { runEngineering } from '../utils/engineering';
import type { EngineeringInputs, SweepRequest } from '../utils/engineeringTypes';
import { bracket, LIFT, objectsOf, printed } from './assembly.fixtures';
import { fastenerInput } from './fastenerSpec';
import { clampsOf, fastenerCarriers, withFastenerFollowers } from './followers';

const YAW: RobotJoint = {
  id: 'yaw',
  name: 'Yaw',
  type: 'revolute',
  parent: ['base'],
  child: ['plate', 'boss'],
  origin: [0, LIFT - 10, 0],
  axis: [0, 1, 0],
  range: [-90, 90],
};

const PROJECT: ProjectSettings = { printer: 'default', material: 'PLA', infillPct: 20 };

const arm = (): ScenePart[] => [...bracket(), printed('base', { size: [40, 10, 30] }, [0, LIFT - 20, 0])];

async function rangeRow(parts: ScenePart[], joints: RobotJoint[]) {
  const scene = snapshotShapes(objectsOf(parts));
  const input: EngineeringInputs = {
    parts,
    project: { ...PROJECT, joints },
    measures: await measuresIn(scene),
    servoOutputs: {},
  };
  const requests: SweepRequest[] = [];

  runEngineering({ ...input, sweep: (s) => (requests.push(s), []) });

  const results = await sweepsIn(scene, requests);
  const keys = requests.map((r) => JSON.stringify(r));
  const report = runEngineering({ ...input, sweep: (s) => results[keys.indexOf(JSON.stringify(s))] ?? [] });

  return report.rows.find((r) => r.check === 'Range of motion')!;
}

describe('fasteners follow the joint that moves what they clamp', () => {
  it('fails the range row when screws stay behind, and passes once they follow', async () => {
    const parts = arm();
    const chains = await fastenersIn(snapshotShapes(objectsOf(parts)), fastenerInput(parts));
    const followed = withFastenerFollowers([YAW], clampsOf(chains));

    expect((await rangeRow(parts, [YAW])).status).toBe('fail');
    expect(followed[0].child.sort()).toEqual(['boss', 'insert-1', 'insert-2', 'plate', 'screw-1', 'screw-2']);
    expect((await rangeRow(parts, followed)).status).toBe('pass');
  });

  it('turns horn screws with the child side, past the joint’s own servo', () => {
    const joint: RobotJoint = { ...YAW, parent: ['frame'], child: ['link'], actuators: ['servo'] };
    const carriers = fastenerCarriers([joint], {
      horn: ['link', 'servo'],
      caseScrew: ['servo', 'frame'],
      nut: ['@horn'],
    });

    expect(Object.fromEntries(carriers)).toEqual({ horn: 'yaw', nut: 'yaw' });
  });

  it('keeps fasteners the joints already list', () => {
    const joint: RobotJoint = { ...YAW, child: ['plate', 'screw-1'] };

    expect(fastenerCarriers([joint], { 'screw-1': ['plate'] }).size).toBe(0);
  });
});
