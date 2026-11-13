import * as THREE from 'three';
import type { JointValues } from '../types/robotics';
import { forwardKinematics, solveIK, type IkTarget, type Rig, type V3 } from '../utils/kinematics';
import { gripValues, restSide, sideFor, topDownTargets, type ArmGrip } from './driveGrip';
import { LegsDrive, type LegsSetup } from './driveLegs';
import { PoseDrive, type PoseSetup } from './drivePose';
import { CONTROL_DT } from './driveTiming';
import type { DriveCommand, DriveHand, DriveLoop, DriveOutput } from './driveTypes';

export type { DriveCommand, DriveHand, DriveLoop, DriveOutput } from './driveTypes';
export { CONTROL_DT } from './driveTiming';

export interface ArmSetup {
  kind: 'arm';
  robot: string;
  rig: Rig;
  part: string;
  point: V3;
  joints: string[];
  start: JointValues;
  anchor: V3;
  reachMm: number;
  grip?: ArmGrip;
}

export interface WheelSetup {
  joint: string;
  spin: number;
  lateralMm: number;
  radiusMm: number;
}

export interface RoverSetup {
  kind: 'rover';
  robot: string;
  wheels: WheelSetup[];
  maxSpeedMmS: number;
  maxTurnRadS: number;
}

export type RobotDrive = ArmSetup | RoverSetup | LegsSetup | PoseSetup;

export interface TeamSetup {
  kind: 'team';
  members: Array<{ slot: number; setup: RobotDrive }>;
}

export type DriveSetup = RobotDrive | TeamSetup;

export const REACH_PER_SECOND = 0.9;

const LIFT_SHARE = 0.7;
const IK_ITERATIONS = 16;

const clampUnit = (x: number) => Math.max(-1, Math.min(1, x));

export const zeroCommand = (): DriveCommand => ({ v: [0, 0, 0] });

const isMoving = ({ v, aux }: DriveCommand) => v.some((x) => x !== 0) || !!aux?.[0];

export function tipOf({ rig, part, point }: ArmSetup, values: JointValues): V3 {
  const posed = forwardKinematics(rig, { values });
  const owner = rig.ownerOf.get(part);
  const p = new THREE.Vector3(...point).applyMatrix4((owner && posed.joint.get(owner)) || posed.root);

  return [p.x, p.y, p.z];
}

class ArmDrive implements DriveLoop {
  private readonly setup: ArmSetup;

  readonly hand: DriveHand;

  private values: JointValues;

  private goal: V3;

  private aim: V3;

  private cmd = zeroCommand();

  private nextAt = 0;

  private side: V3 = [1, 0, 0];

  constructor(setup: ArmSetup) {
    this.setup = setup;
    this.hand = { part: setup.part, point: setup.point };
    this.values = { ...setup.start };
    this.goal = tipOf(setup, setup.start);
    this.aim = [...this.goal];

    if (setup.grip) this.side = restSide(setup.grip);
  }

  command(c: DriveCommand, measured?: JointValues) {
    const released = isMoving(this.cmd) && !isMoving(c) && !c.target;

    this.cmd = c;

    if (c.target) this.aim = [...c.target];

    if (!released) return;

    if (measured) this.values = Object.fromEntries(this.setup.joints.map((id) => [id, measured[id] ?? 0]));

    this.goal = tipOf(this.setup, this.values);
    this.aim = [...this.goal];
  }

  private speed() {
    return this.setup.reachMm * REACH_PER_SECOND;
  }

  private moveAim() {
    const { v, aux, target } = this.cmd;

    if (target) return;

    const step = this.speed() * CONTROL_DT;

    this.aim[0] += clampUnit(v[1]) * step;
    this.aim[1] += clampUnit(aux?.[0] ?? 0) * step * LIFT_SHARE;
    this.aim[2] += clampUnit(v[0]) * step;
    this.keepInReach();
  }

  private keepInReach() {
    const { anchor, reachMm } = this.setup;
    const offset = this.aim.map((x, i) => x - anchor[i]);
    const length = Math.hypot(...offset);

    if (length <= reachMm * 0.98) return;

    const scale = (reachMm * 0.98) / length;

    this.aim = offset.map((x, i) => anchor[i] + x * scale) as V3;
  }

  private moveGoal() {
    const offset = this.aim.map((x, i) => x - this.goal[i]);
    const length = Math.hypot(...offset);
    const step = this.speed() * CONTROL_DT;

    if (length <= step) {
      this.goal = [...this.aim];

      return;
    }

    this.goal = this.goal.map((x, i) => x + (offset[i] / length) * step) as V3;
  }

  tick(time: number): DriveOutput {
    if (time < this.nextAt - 1e-9) return { values: this.output() };

    this.nextAt = time + CONTROL_DT;
    this.moveAim();
    this.moveGoal();

    const { rig, joints } = this.setup;
    const solved = solveIK(rig, this.values, this.targets(), {
      joints,
      iterations: IK_ITERATIONS,
      tolerance: 0.5,
      prefer: this.values,
      preferWeight: 0.002,
    });

    this.values = solved.values;

    return { values: this.output() };
  }

  private targets(): IkTarget[] {
    const { grip, part, point, anchor } = this.setup;
    const reach: IkTarget = { partId: part, point, target: this.goal };

    if (!grip) return [reach];

    this.side = sideFor(this.goal, anchor, this.side);

    return [reach, ...topDownTargets({ grip, part, point, goal: this.goal, side: this.side })];
  }

  private output(): JointValues {
    const { grip, start } = this.setup;

    if (!grip) return this.values;

    return { ...this.values, ...gripValues(grip, this.cmd.aux?.[1] ?? 0, start) };
  }
}

class RoverDrive implements DriveLoop {
  private readonly setup: RoverSetup;

  private cmd = zeroCommand();

  constructor(setup: RoverSetup) {
    this.setup = setup;
  }

  command(c: DriveCommand) {
    this.cmd = c;
  }

  tick(): DriveOutput {
    const { wheels, maxSpeedMmS, maxTurnRadS } = this.setup;
    const speed = clampUnit(this.cmd.v[0]) * maxSpeedMmS;
    const turn = clampUnit(this.cmd.v[2]) * maxTurnRadS;

    return {
      wheels: Object.fromEntries(
        wheels.map((w) => [w.joint, (w.spin * (speed - turn * w.lateralMm)) / Math.max(w.radiusMm, 1)]),
      ),
    };
  }
}

class TeamDrive implements DriveLoop {
  private readonly members: Array<{ slot: number; drive: DriveLoop }>;

  readonly hand?: DriveHand;

  readonly hands: DriveHand[];

  constructor(setup: TeamSetup) {
    this.members = setup.members.map((m) => ({ slot: m.slot, drive: createDrive(m.setup) }));
    this.hands = this.members.flatMap((m) => (m.drive.hand ? [m.drive.hand] : []));
    this.hand = this.members[0]?.drive.hand;
  }

  command(c: DriveCommand, measured?: JointValues) {
    this.members.find((m) => m.slot === (c.slot ?? 0))?.drive.command(c, measured);
  }

  tick(time: number): DriveOutput {
    const out: Required<DriveOutput> = { values: {}, wheels: {} };

    for (const { drive } of this.members) {
      const { values, wheels } = drive.tick(time);

      Object.assign(out.values, values);
      Object.assign(out.wheels, wheels);
    }

    return out;
  }
}

export function createDrive(setup: DriveSetup): DriveLoop {
  if (setup.kind === 'team') return new TeamDrive(setup);

  if (setup.kind === 'arm') return new ArmDrive(setup);

  if (setup.kind === 'pose') return new PoseDrive(setup);

  return setup.kind === 'rover' ? new RoverDrive(setup) : new LegsDrive(setup);
}

export function rigForWorker(rig: Rig): Rig {
  return { ...rig, parts: [] };
}
