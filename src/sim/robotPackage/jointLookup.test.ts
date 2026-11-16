import { afterEach, describe, expect, it, vi } from 'vitest';
import * as jointIndex from '../../utils/robotImport/jointIndex';
import { fixturePackageJob } from '../fixtures/robotPackage';
import { fixtureRobots } from '../fixtures/robots';
import { POLICY_FORMAT, POLICY_VERSION, policyObsSize, type PolicySpec } from '../policy';
import { robotPackageFiles, type RobotPackageJob } from './buildRobotPackage';
import type { PackagedPolicy } from './policyFiles';

afterEach(() => vi.restoreAllMocks());

function scanJoints<T extends { id: string }>(joints: readonly T[]): Map<string, T> {
  const byId = new Map<string, T>();

  byId.get = (id) => joints.find((joint) => joint.id === id);

  return byId;
}

function policies(joints: string[]): PackagedPolicy[] {
  const actionJoints = [...joints.toReversed(), 'missing'];
  const width = policyObsSize({ joints: actionJoints });
  const spec: PolicySpec = {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'walk',
    robot: 'robot',
    joints: actionJoints,
    defaultPose: actionJoints.map(() => 0),
    actionScale: 0.25,
    controlDt: 0.02,
    command: [0.3, 0, 0],
    obsMean: Array.from({ length: width }, () => 0),
    obsStd: Array.from({ length: width }, () => 1),
    layers: [],
    activation: 'elu',
    trainedSteps: 1000,
    mujoco: '4.0.0',
    createdAt: '2026-11-12T00:00:00Z',
  };

  return ['first', 'second'].map((id) => ({
    spec,
    record: {
      id,
      name: id,
      task: spec.task,
      robot: spec.robot,
      robotName: 'Robot',
      command: spec.command,
      trainedSteps: spec.trainedSteps,
      createdAt: spec.createdAt,
    },
  }));
}

function matchesScan(job: RobotPackageJob) {
  const actual = robotPackageFiles(job);
  const spy = vi.spyOn(jointIndex, 'indexJoints').mockImplementation(scanJoints);
  const expected = robotPackageFiles(job);

  spy.mockRestore();
  expect(actual).toEqual(expected);
}

describe('robot package joint identity lookup', () => {
  it.each(fixtureRobots())('preserves every file for $id and multiple policy action orders', (robot) => {
    const { job } = fixturePackageJob(robot, policies(robot.joints.map((joint) => joint.id)));

    job.model.joints.reverse();
    matchesScan(job);
  });

  it('preserves first duplicates, absent identities, empty lists and later edits', () => {
    const robot = fixtureRobots().find((robot) => robot.id === 'arm-3dof')!;
    const { job } = fixturePackageJob(robot, policies(robot.joints.map((joint) => joint.id)));
    const firstSim = job.model.joints[0];
    const firstScene = job.project.joints![0];

    job.model.joints.push({ ...firstSim, name: 'duplicate', range: [-1, 1] });
    job.project.joints = [...job.project.joints!, { ...firstScene, velocity: 999 }];
    matchesScan(job);
    job.model.joints = job.model.joints.filter((joint) => joint.id !== firstSim.id);
    job.project.joints = job.project.joints.filter((joint) => joint.id !== firstScene.id);
    matchesScan(job);
    job.model.joints[0] = { ...job.model.joints[0], name: 'edited', range: [-12, 34] };
    matchesScan(job);
    job.model.joints = [];
    job.project.joints = [];
    matchesScan(job);
    job.policies = [];
    matchesScan(job);
  });

  it.each(['quad-servo', 'hexapod'])('reads each model identity three times for %s', (id) => {
    const robot = fixtureRobots().find((robot) => robot.id === id)!;
    const { job } = fixturePackageJob(robot);
    let reads = 0;

    job.policies = policies(job.model.joints.map((joint) => joint.id));
    job.model.joints = job.model.joints.map((joint) => ({
      ...joint,
      get id() {
        reads++;

        return joint.id;
      },
    }));

    const actual = robotPackageFiles(job);
    const indexedReads = reads;
    const count = job.model.joints.length;
    const spy = vi.spyOn(jointIndex, 'indexJoints').mockImplementation(scanJoints);

    reads = 0;

    expect(robotPackageFiles(job)).toEqual(actual);
    expect(indexedReads).toBe(3 * count);
    expect(reads).toBe(2 * count * (count + 1) + 2 * count);
    spy.mockRestore();
  });
});
