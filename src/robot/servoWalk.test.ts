import { describe, expect, it } from 'vitest';
import { jointMap } from '../sim/robotPackage/jointMap';
import { DEFAULT_PROJECT, type RobotJoint } from '../types/robotics';
import type { JointStatus } from './robotState';
import { servoLayout } from './sceneRobot';
import { servoStepsToDo, servoWalk } from './servoWalk';

const joint = (id: string, extra: Partial<RobotJoint> = {}): RobotJoint => ({
  id,
  name: `${id} joint`,
  type: 'revolute',
  parent: [`${id}-parent`],
  child: [`${id}-link`, `${id}-servo`],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  ...extra,
});

const ARM = [joint('shoulder'), joint('mount', { type: 'fixed' }), joint('elbow'), joint('wrist')];

const BIPED = ['hip', 'knee', 'ankle'].flatMap((name) => [
  joint(`left-${name}`, { limb: 'leg' }),
  joint(`right-${name}`, { limb: 'leg' }),
]);

const mapIds = (joints: RobotJoint[]) =>
  jointMap({
    model: { joints: [], robots: [] },
    project: { ...DEFAULT_PROJECT, joints },
    parts: [],
    name: 'robot',
  }).joints.map((j) => [j.joint, j.id]);

const answering = (ids: number[], total: number): JointStatus[] =>
  Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    position: null,
    temp_c: null,
    volts: null,
    torque_on: null,
    reply: ids.includes(i + 1) ? 'ok' : 'missing',
  }));

describe('servo walk', () => {
  it.each([
    ['arm', ARM],
    ['biped', BIPED],
  ])('numbers the %s like the servo layout and joint_map.json, highest ID first', (_, joints) => {
    const walk = servoWalk(joints);
    const layout = servoLayout(joints);

    expect(walk.map((s) => s.id)).toEqual([...layout.ids].reverse());
    expect(walk.map((s) => [s.name, s.id]).reverse()).toEqual(mapIds(joints));
    expect(walk.map((s) => s.jointId).reverse()).toEqual(layout.movable.map((j) => j.id));
    expect(walk.every((s, i) => s.link.join() === joints.find((j) => j.id === walk[i].jointId)?.child.join())).toBe(
      true,
    );
  });

  it('walks the arm wrist, elbow, shoulder and lights each moving link', () => {
    expect(servoWalk(ARM)).toEqual([
      { jointId: 'wrist', name: 'wrist joint', id: 3, link: ['wrist-link', 'wrist-servo'] },
      { jointId: 'elbow', name: 'elbow joint', id: 2, link: ['elbow-link', 'elbow-servo'] },
      { jointId: 'shoulder', name: 'shoulder joint', id: 1, link: ['shoulder-link', 'shoulder-servo'] },
    ]);
  });

  it('resumes where the bus left off, and keeps ID 1 last', () => {
    const walk = servoWalk(BIPED);
    const ids = (status: JointStatus[]) => servoStepsToDo(walk, status).map((s) => s.id);

    expect(ids(answering([], 6))).toEqual([6, 5, 4, 3, 2, 1]);
    expect(ids(answering([6, 5], 6))).toEqual([4, 3, 2, 1]);
    expect(ids(answering([6, 5, 1], 6))).toEqual([4, 3, 2, 1]);
    expect(ids(answering([6, 5, 4, 3, 2], 6))).toEqual([1]);
    expect(ids(answering([6, 5, 4, 3, 2, 1], 6))).toEqual([]);
    expect(ids([])).toEqual([6, 5, 4, 3, 2, 1]);
  });
});
