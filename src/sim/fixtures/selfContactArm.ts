import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { box, joint } from './parts';
import { buildMjcf } from '../mjcf';
import type { RobotAnimation } from '../../types/robotics';

export function selfContactArmInput(enabled: boolean, exclusions?: [string, string][]) {
  const parts = [
    box('base', [0, 100, 0], [40, 40, 40], 1000),
    box('upper', [0, 150, 0], [10, 100, 10], 100),
    box('tip', [45, 200, 0], [90, 10, 10], 100),
  ];
  const joints = [
    joint({ id: 'shoulder', link: ['base', 'upper'], origin: [0, 100, 0], axis: [0, 0, 1], effortNm: 10 }),
    joint({ id: 'elbow', link: ['upper', 'tip'], origin: [0, 200, 0], axis: [0, 0, 1], effortNm: 1 }),
  ];
  const rig = buildRig(joints, parts);
  const key = rig.robots[0].key;

  return {
    parts,
    rig,
    project: { ...DEFAULT_PROJECT, selfContact: { [key]: { enabled, exclusions } } },
    measures: {},
    partTriangles: (_id: string): Float32Array | null => null,
    fixedBase: { [key]: true },
  };
}

export const selfContactArm = (enabled: boolean, exclusions?: [string, string][]) =>
  buildMjcf(selfContactArmInput(enabled, exclusions));

export function selfContactArmScene() {
  const input = selfContactArmInput(false);
  const animation: RobotAnimation = {
    id: 'fold',
    name: 'Fold',
    duration: 2,
    loop: false,
    interpolation: 'linear',
    keyframes: [
      { t: 0, values: { shoulder: 0, elbow: 0 } },
      { t: 1, values: { shoulder: 0, elbow: -90 } },
      { t: 2, values: { shoulder: 0, elbow: -90 } },
    ],
  };

  return {
    name: 'Folding arm',
    parts: input.parts,
    project: { ...input.project, joints: input.rig.joints, animations: [animation] },
  };
}
