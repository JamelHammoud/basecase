import { silhouetteDrawer } from '../cameras/silhouette';
import { sceneCamera, type DatasetCamera } from '../datasets/cameras';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { V3 } from '../utils/kinematics';
import { COUNTS_PER_TURN, DEFAULT_MOUNT, mountDegrees, type MountFrame, type MountRequest } from './mountSearch';
import type { JointMount } from './types';

export interface FixtureRobot {
  parts: ScenePart[];
  joints: RobotJoint[];
}

export const part = (id: string, position: V3, size: V3, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position,
  rotation: [0, 0, 0],
  dimensions: { width: size[0], height: size[1], depth: size[2] },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

export const joint = (id: string, parent: string[], child: string[], at: { origin: V3; axis: V3 }): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent,
  child,
  origin: at.origin,
  axis: at.axis,
  limb: 'arm',
});

export interface Link {
  axis: V3;
  height?: number;
  kind?: ScenePart['kind'];
  size?: [number, number];
}

export function stackedArm(links: Link[]): FixtureRobot {
  const parts = [part('base', [0, 20, 0], [60, 40, 60])];
  const joints: RobotJoint[] = [];
  let top = 40;

  links.forEach((link, k) => {
    const height = link.height ?? 80;
    const [width, depth] = link.size ?? [30, 30];
    const id = `link${k + 1}`;

    parts.push(part(id, [0, top + height / 2, 0], [width, height, depth], link.kind ? { kind: link.kind } : {}));
    joints.push(joint(`j${k + 1}`, [k ? `link${k}` : 'base'], [id], { origin: [0, top, 0], axis: link.axis }));
    top += height;
  });

  for (const [k, j] of joints.entries()) j.child = joints.slice(k).map((_, i) => `link${k + i + 1}`);

  return { parts, joints };
}

export const TWO_JOINT_ARM = stackedArm([{ axis: [1, 0, 0] }, { axis: [1, 0, 0] }]);

export const SIX_JOINT_ARM = stackedArm([
  { axis: [0, 0, 1] },
  { axis: [1, 0, 0] },
  { axis: [0, 0, 1] },
  { axis: [1, 0, 0] },
  { axis: [0, 0, 1], height: 60 },
  { axis: [1, 0, 0], height: 50 },
]);

export const WRIST_ROLL_ARM = stackedArm([{ axis: [1, 0, 0] }, { axis: [0, 1, 0], kind: 'cylinder', height: 70 }]);

function leg(side: string, x: number): FixtureRobot {
  const thigh = `${side}-thigh`;
  const shin = `${side}-shin`;

  return {
    parts: [part(thigh, [x, 160, 0], [30, 80, 30]), part(shin, [x, 80, 0], [30, 80, 30])],
    joints: [
      { ...joint(`${side}-hip`, ['pelvis'], [thigh, shin], { origin: [x, 200, 0], axis: [1, 0, 0] }), limb: 'leg' },
      { ...joint(`${side}-knee`, [thigh], [shin], { origin: [x, 120, 0], axis: [1, 0, 0] }), limb: 'leg' },
    ],
  };
}

export function biped(): FixtureRobot {
  const left = leg('left', -40);
  const right = leg('right', 40);

  return {
    parts: [part('pelvis', [0, 220, 0], [120, 40, 50]), ...left.parts, ...right.parts],
    joints: [...left.joints, ...right.joints],
  };
}

export function shieldedArm(): FixtureRobot & { view: DatasetCamera } {
  const parts = [
    part('base', [0, 20, 0], [60, 40, 60]),
    part('shield', [0, 150, 60], [260, 260, 10]),
    part('link1', [0, 80, 0], [30, 80, 30]),
    part('link2', [0, 150, 0], [20, 60, 20]),
  ];
  const joints = [
    joint('j1', ['base', 'shield'], ['link1', 'link2'], { origin: [0, 40, 0], axis: [0, 1, 0] }),
    joint('j2', ['link1'], ['link2'], { origin: [0, 120, 0], axis: [0, 0, 1] }),
  ];
  const view: DatasetCamera = { ...sceneCamera(parts, []), position: [0, 150, 700], target: [0, 150, 0] };

  return { parts, joints, view };
}

export const sceneView = (robot: FixtureRobot) => sceneCamera(robot.parts, []);

export function rolledView(view: DatasetCamera, degrees: number): DatasetCamera {
  const forward = view.target.map((t, i) => t - view.position[i]) as V3;
  const n = Math.hypot(...forward);
  const [fx, fy, fz] = forward.map((v) => v / n);
  const [ux, uy, uz] = view.up;
  const a = (degrees * Math.PI) / 180;
  const dot = fx * ux + fy * uy + fz * uz;
  const cross: V3 = [fy * uz - fz * uy, fz * ux - fx * uz, fx * uy - fy * ux];
  const up = view.up.map(
    (u, i) => u * Math.cos(a) + cross[i] * Math.sin(a) + [fx, fy, fz][i] * dot * (1 - Math.cos(a)),
  );

  return { ...view, up: up as V3 };
}

const WIGGLE_RAD = 0.1;
const wiggleCounts = Math.round((WIGGLE_RAD * COUNTS_PER_TURN) / (2 * Math.PI));

export interface CaptureInput {
  robot: FixtureRobot;
  view: DatasetCamera;
  planted?: Record<string, JointMount>;
  start?: number[];
}

export function wiggleFrames({ robot, view, planted = {}, start }: CaptureInput): MountFrame[] {
  const order = robot.joints.map((j) => j.id);
  const draw = silhouetteDrawer({ parts: robot.parts, joints: robot.joints, view });
  const rest = start ?? order.map(() => DEFAULT_MOUNT.zeroCounts);
  const frame = (counts: number[]): MountFrame => ({
    counts,
    silhouette: draw(
      Object.fromEntries(order.map((id, k) => [id, mountDegrees(counts[k], planted[id] ?? DEFAULT_MOUNT)])),
    ),
  });

  return order.flatMap((_, k) =>
    [0, wiggleCounts, -wiggleCounts].map((step) => frame(rest.map((c, i) => (i === k ? c + step : c)))),
  );
}

export function mountRequest(input: CaptureInput & { search?: string[] }): MountRequest {
  const order = input.robot.joints.map((j) => j.id);

  return {
    parts: input.robot.parts,
    joints: input.robot.joints,
    view: input.view,
    order,
    mounts: order.map(() => DEFAULT_MOUNT),
    search: input.search ?? order,
    frames: wiggleFrames(input),
  };
}

export const offsetMount = (degrees: number, direction: 1 | -1 = 1): JointMount => ({
  zeroCounts: DEFAULT_MOUNT.zeroCounts + (degrees * COUNTS_PER_TURN) / 360,
  direction,
});
