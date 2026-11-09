import type { MainModule } from '@mujoco/mujoco';
import type { DriveCommand, DriveSetup } from '../sim/drive';
import { rigForWorker } from '../sim/drive';
import { footPoints } from '../sim/driveLegs';
import { armSetup, roverForward, roverSetup } from '../sim/driveSetup';
import { SimEngine, type Controller } from '../sim/engine';
import { buildMjcf } from '../sim/mjcf';
import type { MjcfInput, SimModel } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig, type Rig, type V3 } from '../utils/kinematics';
import { evaluateContract, type Trace } from '../skills/contract';
import { GroundSteer } from './groundSteer';
import { probeReader } from './probes';
import { boundEffector, robotFacts, slotRefusal, type EndEffector, type RobotFacts } from './robotFit';
import { scaledToReach } from './scale';
import { worldItem, type Case, type ReferenceCommand } from './schema';

export const RECORD_DT = 0.02;

export interface CaseRobot {
  id: string;
  parts: MjcfInput['parts'];
  joints: Parameters<typeof buildRig>[0];
  measures: MjcfInput['measures'];
  partTriangles: MjcfInput['partTriangles'];
}

export interface CaseFrame {
  t: number;
  poses: Float64Array;
}

export interface CaseResult {
  passed: boolean;
  margin: number;
  failed: string[];
  trace: Trace;
  refusal?: string;
  model: SimModel;
  frames: CaseFrame[];
  objectIds: string[];
  case: Case;
}

interface ProbeBase {
  part: string | null;
  point: V3;
}

export interface RunOptions {
  controller: 'limp' | 'reference';
}

interface DriveFor {
  kase: Case;
  rig: Rig;
  robot: CaseRobot;
  facts: RobotFacts;
  effector: EndEffector | null;
}

const MIN_DRIVEN_FEET = 4;

function groundDrive(rig: Rig, robot: CaseRobot, facts: RobotFacts, key: string): DriveSetup | null {
  if (facts.morphology === 'legged') {
    const feet = footPoints(rig, robot.parts, key);

    return feet.length >= MIN_DRIVEN_FEET
      ? { kind: 'legs', robot: key, rig: rigForWorker(rig), feet, start: {} }
      : null;
  }

  return facts.wheels.length ? roverSetup(rig, robot.parts, key) : null;
}

function driveFor({ kase, rig, robot, facts, effector }: DriveFor): DriveSetup | null {
  const key = rig.robots[0]?.key ?? '';

  if (kase.slot.needs.includes('arm') && effector && facts.armJoints.length) {
    const { armJoints: joints, anchor, reachMm } = facts;

    return armSetup({ rig, robot: key, effector, joints, anchor, reachMm });
  }

  return groundDrive(rig, robot, facts, key);
}

const LEGS_FORWARD: V3 = [0, 0, 1];

interface SteerFor {
  setup: DriveSetup | null;
  model: SimModel;
  base: ProbeBase;
  wheelAxes: V3[];
  objectAt: Map<string, V3>;
}

function steerFor({ setup, model, base, wheelAxes, objectAt }: SteerFor): GroundSteer | null {
  if (!setup || setup.kind === 'arm' || !base.part) return null;

  const forward = setup.kind === 'rover' ? (roverForward(wheelAxes).toArray() as V3) : LEGS_FORWARD;

  const sideways = setup.kind === 'legs';

  return new GroundSteer({ model, part: base.part, point: base.point, forward, objectAt, sideways });
}

const toCommand = (c: ReferenceCommand): DriveCommand => ({ v: c.v ?? [0, 0, 0], target: c.target, aux: c.aux });

function chooseController(setup: DriveSetup | null, options: RunOptions): Controller {
  if (options.controller === 'limp' || !setup) return { kind: 'limp' };

  return { kind: 'drive', setup };
}

interface Rollout {
  engine: SimEngine;
  kase: Case;
  steer: GroundSteer | null;
  sample: (poses: Float64Array) => void;
}

function follow(engine: SimEngine, steer: GroundSteer | null, c: ReferenceCommand) {
  if (!steer) return engine.command(toCommand(c));

  if (c.target) return steer.add(c.target, { speed: c.v?.[0], push: c.push });

  steer.clear();
  engine.command(toCommand(c));
}

function roll({ engine, kase, steer, sample }: Rollout): CaseFrame[] {
  const timeline = [...kase.reference.timeline].sort((a, b) => a.at - b.at);
  const frames: CaseFrame[] = [];
  const ticks = Math.round(kase.task.seconds / RECORD_DT);

  for (let tick = 0; tick < ticks; tick++) {
    const t = tick * RECORD_DT;

    while (timeline.length && timeline[0].at <= t + 1e-9) follow(engine, steer, timeline.shift()!);

    const poses = engine.poses();

    if (steer?.steering) engine.command(steer.command(poses));

    sample(poses);
    frames.push({ t, poses });
    engine.step(RECORD_DT);
  }

  return frames;
}

function fixedBaseFor(rig: Rig, facts: RobotFacts): Record<string, boolean> | undefined {
  const key = rig.robots[0]?.key;

  return key && facts.morphology === 'fixed' ? { [key]: true } : undefined;
}

export async function runCase(
  mj: MainModule,
  authored: Case,
  robot: CaseRobot,
  options: RunOptions,
): Promise<CaseResult> {
  const rig = buildRig(robot.joints, robot.parts);
  const facts = robotFacts(rig, robot.parts);
  const refusal = slotRefusal(authored.slot, facts);
  const base = { parts: robot.parts, rig, project: DEFAULT_PROJECT, measures: robot.measures };
  const input = { ...base, partTriangles: robot.partTriangles };

  if (refusal)
    return {
      passed: false,
      margin: -1,
      failed: [],
      trace: { dt: RECORD_DT, signals: {} },
      refusal,
      model: buildMjcf(input),
      frames: [],
      objectIds: [],
      case: authored,
    };

  const kase = scaledToReach(authored, facts.reachMm, facts.anchor);
  const world = kase.world.objects.map(worldItem);
  const model = buildMjcf({ ...input, world, fixedBase: fixedBaseFor(rig, facts) });
  const engine = new SimEngine(mj, model);
  const effector = boundEffector(kase.slot.binding, facts, rig);
  const signals: Record<string, number[]> = {};
  const probeBase: ProbeBase = {
    part: robot.parts.find((p) => !rig.ownerOf.has(p.id))?.id ?? null,
    point: rig.robots[0]?.pivot ?? ([0, 0, 0] as V3),
  };
  const objectAt = new Map(kase.world.objects.map((o) => [o.id, o.position]));
  const reader = probeReader(kase.task.probes, {
    model,
    effector,
    basePart: probeBase.part,
    basePoint: probeBase.point,
    objectAt,
  });
  const setup = options.controller === 'reference' ? driveFor({ kase, rig, robot, facts, effector }) : null;
  const wheelAxes = facts.wheels.flatMap((id): V3[] => {
    const axis = rig.byId.get(id)?.axis;

    return axis ? [axis] : [];
  });
  const steer = steerFor({ setup, model, base: probeBase, wheelAxes, objectAt });

  engine.setController(chooseController(setup, options));

  try {
    const frames = roll({ engine, kase, steer, sample: (poses) => reader.sample(poses, signals) });
    const trace = { dt: RECORD_DT, signals };
    const verdict = await evaluateContract(kase.task.contract, trace);

    return {
      passed: verdict.passed,
      margin: verdict.margin,
      failed: verdict.failed,
      trace,
      model,
      frames,
      objectIds: kase.world.objects.map((o) => o.id),
      case: kase,
    };
  } finally {
    engine.dispose();
  }
}
