import { Euler, Quaternion, Vector3 } from 'three';
import { box, joint, fixtureMeasures, fixtureTriangles, type P3 } from '../sim/fixtures/parts';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { fixtureRobot } from './fixtureModels';
import { withoutGripper } from '../sim/fixtures/robots';
import type { RobotJoint } from '../types/robotics';

function initialValue(joint: RobotJoint, index: number) {
  if (joint.type === 'prismatic') return (joint.range![0] + joint.range![1]) / 2;

  return index % 2 ? 8 : -12;
}

export const WORKSPACE_DESIGNS = [
  'planar',
  'three-axis',
  'six-axis',
  'short-elbow',
  'offset-tool',
  'long-tool',
  'rotated-pedestal',
  'asymmetric',
  'parked-gripper',
  'dual-arm',
] as const;

export function armWorkspaceCase(kind: (typeof WORKSPACE_DESIGNS)[number]) {
  const original = fixtureRobot(kind === 'six-axis' || kind === 'parked-gripper' ? 'arm-6dof' : 'arm-3dof');
  const source = kind === 'six-axis' ? withoutGripper(original) : original;

  if (kind === 'planar') source.joints = source.joints.slice(0, 2).map((j) => ({ ...j, axis: [0, 0, 1] }));

  if (kind === 'short-elbow') source.joints[1] = { ...source.joints[1], range: [-3, 7] };

  if (kind === 'asymmetric') source.joints[0] = { ...source.joints[0], range: [-14, 67] };

  if (kind === 'long-tool') source.parts[3] = box('link2', [0, 270, 0], [18, 160, 18], 80);

  if (kind === 'dual-arm') {
    source.parts.push(
      box('park-base', [120, 210, 0], [20, 30, 40], 1000),
      box('park-link', [75, 210, 0], [80, 20, 30], 100),
    );
    source.joints.push(
      joint({ id: 'park', link: ['park-base', 'park-link'], origin: [120, 210, 0], axis: [0, 1, 0], effortNm: 10 }),
    );
  }

  const rotation: P3 = kind === 'rotated-pedestal' ? [21, 37, -18] : [0, 0, 0];
  const turn = new Quaternion().setFromEuler(new Euler(...(rotation.map((v) => (v * Math.PI) / 180) as P3)));
  const transform = (v: P3, point = true): P3 => {
    const p = new Vector3(...v).applyQuaternion(turn);

    const precision = point ? 1000 : 1_000_000;

    return [p.x, p.y + (point ? 350 : 0), p.z].map((v) => Math.round(v * precision) / precision) as P3;
  };
  const parts = source.parts.map((p) => ({ ...p, position: transform(p.position), rotation }));
  const joints = source.joints.map((j) => ({ ...j, origin: transform(j.origin), axis: transform(j.axis, false) }));
  const rig = buildRig(joints, parts);
  const part = kind === 'planar' ? 'link1' : `link${kind === 'six-axis' || kind === 'parked-gripper' ? 5 : 2}`;
  const tool = parts.find((p) => p.id === part)!;
  const point: P3 =
    kind === 'offset-tool' ? [tool.position[0] + 35, tool.position[1] + 12, tool.position[2] - 17] : [...tool.position];
  const pose = { values: Object.fromEntries(joints.map((j, i) => [j.id, initialValue(j, i)])) };
  const input = {
    parts,
    rig,
    project: { ...DEFAULT_PROJECT, joints },
    pose,
    measures: fixtureMeasures(parts),
    partTriangles: fixtureTriangles(parts),
    fixedBase: Object.fromEntries(rig.robots.map((r) => [r.key, true])),
  };

  return { input, point, part, model: buildMjcf(input) };
}
