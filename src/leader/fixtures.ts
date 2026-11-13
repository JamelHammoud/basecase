import { box, joint, type FixtureRobot, type P3 } from '../sim/fixtures/parts';
import type { RobotJoint } from '../types/robotics';

const X: P3 = [1, 0, 0];
const Y: P3 = [0, 1, 0];
const Z: P3 = [0, 0, 1];

export interface Link {
  id: string;
  axis: P3;
  origin: P3;
  type?: RobotJoint['type'];
  range?: [number, number];
}

export function serialArm(id: string, links: Link[]): FixtureRobot {
  const parts = [box('base', [0, 20, 0], [120, 40, 120], 600)];
  const joints: RobotJoint[] = [];

  links.forEach((l, i) => {
    const end = links[i + 1]?.origin ?? [l.origin[0], l.origin[1] + 40, l.origin[2]];
    const mid: P3 = [(l.origin[0] + end[0]) / 2, (l.origin[1] + end[1]) / 2, (l.origin[2] + end[2]) / 2];

    parts.push(box(`${l.id}_link`, mid, [30, 30, 30], 120));
    joints.push({
      ...joint({
        id: l.id,
        link: [i ? `${links[i - 1].id}_link` : 'base', `${l.id}_link`],
        origin: l.origin,
        axis: l.axis,
        effortNm: 5,
        parentJoint: i ? links[i - 1].id : undefined,
        range: l.range ?? [-120, 120],
        limb: 'arm',
      }),
      type: l.type ?? 'revolute',
    });
  });

  return { id, parts, joints, expect: { morphology: 'fixed', stand: 'n/a', walk: 'n/a' } };
}

export const deskArm = () =>
  serialArm('desk-arm', [
    { id: 'base_yaw', axis: Y, origin: [0, 60, 0], range: [-110, 110] },
    { id: 'shoulder_pitch', axis: X, origin: [0, 140, 0], range: [-100, 100] },
    { id: 'elbow_pitch', axis: X, origin: [0, 256, 0], range: [-110, 110] },
    { id: 'wrist_pitch', axis: X, origin: [0, 372, 0], range: [-110, 110] },
    { id: 'gripper', axis: Z, origin: [0, 410, 0], range: [0, 90] },
  ]);

export const urArm = () =>
  serialArm('ur-arm', [
    { id: 'shoulder_pan', axis: Y, origin: [0, 90, 0] },
    { id: 'shoulder_lift', axis: X, origin: [0, 180, 0] },
    { id: 'elbow', axis: X, origin: [0, 605, 0] },
    { id: 'wrist_1', axis: X, origin: [0, 997, 0] },
    { id: 'wrist_2', axis: Y, origin: [0, 997, 110] },
    { id: 'wrist_3', axis: Z, origin: [0, 1092, 110], range: [-180, 180] },
    { id: 'finger', axis: X, origin: [0, 1092, 200], type: 'prismatic', range: [0, 40] },
  ]);

export const so101Sized = () =>
  serialArm('so101-sized', [
    { id: 'shoulder_pan', axis: Y, origin: [0, 60, 0] },
    { id: 'shoulder_lift', axis: X, origin: [0, 110, 20] },
    { id: 'elbow_flex', axis: X, origin: [0, 220, 40] },
    { id: 'wrist_flex', axis: X, origin: [0, 220, 175] },
    { id: 'wrist_roll', axis: Z, origin: [0, 220, 235] },
    { id: 'gripper', axis: X, origin: [10, 220, 270] },
  ]);

export interface LeaderSample {
  at_us: number;
  positions: number[];
}

const COUNTS_PER_TURN = 4096;
const SAMPLE_US = 20000;
const RUN_US = 4_000_000;
const SWING_DEG = 30;
const SWING_HZ = 0.25;
const REST_DEG = 7;
const PULL_AT_US = 2_000_000;
const PULL_US = 1_000_000;
const PULL_DEG = 50;

const counts = (deg: number) => Math.round(2048 + (deg / 360) * COUNTS_PER_TURN);

function armDeg(k: number, s: number) {
  const phase = 2 * Math.PI * SWING_HZ * s + k;

  return REST_DEG * (k % 2 ? -1 : 1) + SWING_DEG * (Math.sin(phase) - Math.sin(k));
}

const triggerDeg = (us: number) => PULL_DEG * Math.max(0, Math.min(1, (us - PULL_AT_US) / PULL_US));

export function leaderRecording(servos: number, trigger: number | null): LeaderSample[] {
  return Array.from({ length: RUN_US / SAMPLE_US + 1 }, (_, i) => {
    const at = i * SAMPLE_US;

    return {
      at_us: at,
      positions: Array.from({ length: servos }, (__, k) =>
        counts(k === trigger ? REST_DEG + triggerDeg(at) : armDeg(k, at / 1e6)),
      ),
    };
  });
}
