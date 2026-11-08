import type { MainModule } from '@mujoco/mujoco';
import type { DriveCommand, DriveSetup } from '../sim/drive';
import { armSetup, roverSetup } from '../sim/driveSetup';
import { SimEngine, type Controller } from '../sim/engine';
import { buildMjcf } from '../sim/mjcf';
import type { MjcfInput, SimModel } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig, type Rig, type V3 } from '../utils/kinematics';
import { evaluateContract, type Trace } from '../skills/contract';
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

export interface RunOptions {
  controller: 'limp' | 'reference';
}

function driveFor(rig: Rig, robot: CaseRobot, facts: RobotFacts, effector: EndEffector | null): DriveSetup | null {
  const key = rig.robots[0]?.key ?? '';

  if (effector && facts.armJoints.length) {
    const { armJoints: joints, anchor, reachMm } = facts;

    return armSetup({ rig, robot: key, effector, joints, anchor, reachMm });
  }

  return facts.wheels.length ? roverSetup(rig, robot.parts, key) : null;
}

const toCommand = (c: ReferenceCommand): DriveCommand => ({ v: c.v ?? [0, 0, 0], target: c.target, aux: c.aux });

function chooseController(setup: DriveSetup | null, options: RunOptions): Controller {
  if (options.controller === 'limp' || !setup) return { kind: 'limp' };

  return { kind: 'drive', setup };
}

interface Rollout {
  engine: SimEngine;
  kase: Case;
  sample: (poses: Float64Array) => void;
}

function roll({ engine, kase, sample }: Rollout): CaseFrame[] {
  const timeline = [...kase.reference.timeline].sort((a, b) => a.at - b.at);
  const frames: CaseFrame[] = [];
  const ticks = Math.round(kase.task.seconds / RECORD_DT);

  for (let tick = 0; tick < ticks; tick++) {
    const t = tick * RECORD_DT;

    while (timeline.length && timeline[0].at <= t + 1e-9) engine.command(toCommand(timeline.shift()!));

    const poses = engine.poses();

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
  const reader = probeReader(kase.task.probes, {
    model,
    effector,
    basePart: robot.parts.find((p) => !rig.ownerOf.has(p.id))?.id ?? null,
    basePoint: rig.robots[0]?.pivot ?? ([0, 0, 0] as V3),
    objectAt: new Map(kase.world.objects.map((o) => [o.id, o.position])),
  });

  engine.setController(chooseController(driveFor(rig, robot, facts, effector), options));

  try {
    const frames = roll({ engine, kase, sample: (poses) => reader.sample(poses, signals) });
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
