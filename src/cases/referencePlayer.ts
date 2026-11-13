import { rigForWorker, type DriveSetup } from '../sim/drive';
import { footPoints } from '../sim/driveLegs';
import { armSetup, roverForward, roverSetup } from '../sim/driveSetup';
import type { DriveCommand } from '../sim/driveTypes';
import type { SimModel } from '../sim/mjcfTypes';
import type { ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import { GroundSteer } from './groundSteer';
import { boundEffector, robotFacts, type EndEffector, type RobotFacts } from './robotFit';
import { toCommand } from './caseDrives';
import { caseSlots, type Case, type ReferenceCommand } from './schema';

export interface CaseBase {
  part: string | null;
  point: V3;
}

export interface DriveFor {
  kase: Case;
  rig: Rig;
  parts: ScenePart[];
  facts: RobotFacts;
  effector: EndEffector | null;
}

interface SteerFor {
  setup: DriveSetup | null;
  model: SimModel;
  rig: Rig;
  parts: ScenePart[];
  kase: Case;
}

interface LivePlayer {
  kase: Case;
  rig: Rig;
  parts: ScenePart[];
  model: SimModel;
  send: (command: DriveCommand) => void;
}

const MIN_DRIVEN_FEET = 4;
const LEGS_FORWARD: V3 = [0, 0, 1];

export const caseBase = (rig: Rig, parts: ScenePart[]): CaseBase => ({
  part: parts.find((p) => !rig.ownerOf.has(p.id))?.id ?? null,
  point: rig.robots[0]?.pivot ?? ([0, 0, 0] as V3),
});

function groundDrive(rig: Rig, parts: ScenePart[], facts: RobotFacts, key: string): DriveSetup | null {
  if (facts.morphology === 'legged') {
    const feet = footPoints(rig, parts, key);

    return feet.length >= MIN_DRIVEN_FEET
      ? { kind: 'legs', robot: key, rig: rigForWorker(rig), feet, start: {} }
      : null;
  }

  return facts.wheels.length ? roverSetup(rig, parts, key) : null;
}

export function driveFor({ kase, rig, parts, facts, effector }: DriveFor): DriveSetup | null {
  const key = rig.robots[0]?.key ?? '';

  if (caseSlots(kase)[0].needs.includes('arm') && effector && facts.armJoints.length) {
    const { armJoints: joints, anchor, reachMm, gripper } = facts;

    return armSetup({ rig, robot: key, effector, joints, anchor, reachMm, grip: gripper });
  }

  return groundDrive(rig, parts, facts, key);
}

export function steerFor({ setup, model, rig, parts, kase }: SteerFor): GroundSteer | null {
  const base = caseBase(rig, parts);

  if (!setup || setup.kind === 'arm' || !base.part) return null;

  const wheelAxes = robotFacts(rig, parts).wheels.flatMap((id): V3[] => {
    const axis = rig.byId.get(id)?.axis;

    return axis ? [axis] : [];
  });
  const forward = setup.kind === 'rover' ? (roverForward(wheelAxes).toArray() as V3) : LEGS_FORWARD;
  const objectAt = new Map(kase.world.objects.map((o) => [o.id, o.position]));

  return new GroundSteer({
    model,
    part: base.part,
    point: base.point,
    forward,
    objectAt,
    sideways: setup.kind === 'legs',
  });
}

export class ReferencePlayer {
  private readonly timeline: ReferenceCommand[];

  private readonly steer: GroundSteer | null;

  private readonly send: (command: DriveCommand) => void;

  constructor(timeline: ReferenceCommand[], steer: GroundSteer | null, send: (command: DriveCommand) => void) {
    this.timeline = [...timeline].sort((a, b) => a.at - b.at);
    this.steer = steer;
    this.send = send;
  }

  tick(t: number, poses: Float64Array) {
    while (this.timeline.length && this.timeline[0].at <= t + 1e-9) this.follow(this.timeline.shift()!);

    if (this.steer?.steering) this.send(this.steer.command(poses));
  }

  private follow(c: ReferenceCommand) {
    if (!this.steer) return this.send(toCommand(c));

    if (c.target) return this.steer.add(c.target, { speed: c.v?.[0], push: c.push });

    this.steer.clear();
    this.send(toCommand(c));
  }
}

export function livePlayer({ kase, rig, parts, model, send }: LivePlayer): ReferencePlayer {
  const facts = robotFacts(rig, parts);
  const effector = boundEffector(caseSlots(kase)[0].binding, facts, rig);
  const setup = driveFor({ kase, rig, parts, facts, effector });

  return new ReferencePlayer(kase.reference.timeline, steerFor({ setup, model, rig, parts, kase }), send);
}
