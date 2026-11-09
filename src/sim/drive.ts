import * as THREE from 'three';
import type { JointValues } from '../types/robotics';
import { forwardKinematics, solveIK, type Rig, type V3 } from '../utils/kinematics';
import { LegsDrive, type LegsSetup } from './driveLegs';
import type { DriveCommand, DriveHand, DriveLoop, DriveOutput } from './driveTypes';

export type { DriveCommand, DriveHand, DriveLoop, DriveOutput } from './driveTypes';

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

export type DriveSetup = ArmSetup | RoverSetup | LegsSetup;

export const CONTROL_DT = 0.02;

const REACH_PER_SECOND = 0.9;
const LIFT_SHARE = 0.7;
const IK_ITERATIONS = 16;

const clampUnit = (x: number) => Math.max(-1, Math.min(1, x));

export const zeroCommand = (): DriveCommand => ({ v: [0, 0, 0] });

const isMoving = ({ v, aux }: DriveCommand) => v.some((x) => x !== 0) || !!aux?.some((x) => x !== 0);

function tipOf({ rig, part, point }: ArmSetup, values: JointValues): V3 {
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

  constructor(setup: ArmSetup) {
    this.setup = setup;
    this.hand = { part: setup.part, point: setup.point };
    this.values = { ...setup.start };
    this.goal = tipOf(setup, setup.start);
    this.aim = [...this.goal];
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
    if (time < this.nextAt - 1e-9) return { values: this.values };

    this.nextAt = time + CONTROL_DT;
    this.moveAim();
    this.moveGoal();

    const { rig, part, point, joints } = this.setup;
    const solved = solveIK(rig, this.values, [{ partId: part, point, target: this.goal }], {
      joints,
      iterations: IK_ITERATIONS,
      tolerance: 0.5,
      prefer: this.values,
      preferWeight: 0.002,
    });

    this.values = solved.values;

    return { values: this.values };
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

export function createDrive(setup: DriveSetup): DriveLoop {
  if (setup.kind === 'arm') return new ArmDrive(setup);

  return setup.kind === 'rover' ? new RoverDrive(setup) : new LegsDrive(setup);
}

export function rigForWorker(rig: Rig): Rig {
  return { ...rig, parts: [] };
}
