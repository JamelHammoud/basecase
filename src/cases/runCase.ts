import type { MainModule } from '@mujoco/mujoco';
import type { DriveSetup } from '../sim/drive';
import { SimEngine, type Controller } from '../sim/engine';
import { buildMjcf } from '../sim/mjcf';
import type { MjcfInput, SimModel } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig, type Rig } from '../utils/kinematics';
import { evaluateContract, type Trace } from '../skills/contract';
import { probeReader } from './probes';
import { caseBase, driveFor, ReferencePlayer, steerFor } from './referencePlayer';
import { boundEffector, robotFacts, slotRefusal, type RobotFacts } from './robotFit';
import { scaledToReach } from './scale';
import { worldItem, type Case } from './schema';

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

function chooseController(setup: DriveSetup | null, options: RunOptions): Controller {
  if (options.controller === 'limp' || !setup) return { kind: 'limp' };

  return { kind: 'drive', setup };
}

interface Rollout {
  engine: SimEngine;
  kase: Case;
  player: ReferencePlayer;
  sample: (poses: Float64Array) => void;
}

function roll({ engine, kase, player, sample }: Rollout): CaseFrame[] {
  const frames: CaseFrame[] = [];
  const ticks = Math.round(kase.task.seconds / RECORD_DT);

  for (let tick = 0; tick < ticks; tick++) {
    const t = tick * RECORD_DT;
    const poses = engine.poses();

    player.tick(t, poses);
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
  const probeBase = caseBase(rig, robot.parts);
  const objectAt = new Map(kase.world.objects.map((o) => [o.id, o.position]));
  const reader = probeReader(kase.task.probes, {
    model,
    effector,
    basePart: probeBase.part,
    basePoint: probeBase.point,
    objectAt,
  });
  const setup =
    options.controller === 'reference' ? driveFor({ kase, rig, parts: robot.parts, facts, effector }) : null;
  const steer = steerFor({ setup, model, rig, parts: robot.parts, kase });
  const player = new ReferencePlayer(kase.reference.timeline, steer, (c) => engine.command(c));

  engine.setController(chooseController(setup, options));

  try {
    const frames = roll({ engine, kase, player, sample: (poses) => reader.sample(poses, signals) });
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
