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
import { NO_BODY, routineBody, type RoutineBody } from '../routines/physicsBody';
import type { RoutineKit } from '../routines/physicsKit';
import type { Plan } from '../routines/planTypes';
import type { SkillContract } from '../routines/schema';
import { caseFactReader, caseSignalNames, sampleSignals, type CaseFactReader } from './caseFacts';
import {
  CaseLogicRun,
  compileCaseLogic,
  judgeSoFar,
  usesBodySkills,
  type CaseInput,
  type CaseLogicResult,
} from './caseLogic';
import { GroundSteer } from './groundSteer';
import { probeReader } from './probes';
import { boundEffector, robotFacts, slotRefusal, type EndEffector, type RobotFacts } from './robotFit';
import { scaledToReach } from './scale';
import { worldItem, type Case, type ReferenceCommand } from './schema';
import type { CaseFacts } from './caseFacts';

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
  logic?: CaseLogicResult;
}

interface ProbeBase {
  part: string | null;
  point: V3;
}

export interface RunOptions {
  controller: 'limp' | 'reference';
  kit?: RoutineKit;
  skills?: readonly SkillContract[];
  inputs?: CaseInput[];
}

const JUDGE_EVERY_TICKS = 12;

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
  sample: (poses: Float64Array, t: number) => CaseFacts;
  logic: CaseLogicRun | null;
  judge: () => Promise<CaseFacts>;
}

interface Follower {
  engine: SimEngine;
  steer: GroundSteer | null;
  last: ReferenceCommand | null;
}

function follow(f: Follower, c: ReferenceCommand) {
  f.last = c;

  if (!f.steer) return f.engine.command(toCommand(c));

  if (c.target) return f.steer.add(c.target, { speed: c.v?.[0], push: c.push });

  f.steer.clear();
  f.engine.command(toCommand(c));
}

async function roll({ engine, kase, steer, sample, logic, judge }: Rollout): Promise<CaseFrame[]> {
  const timeline = [...kase.reference.timeline].sort((a, b) => a.at - b.at);
  const frames: CaseFrame[] = [];
  const ticks = Math.round(kase.task.seconds / RECORD_DT);
  const follower: Follower = { engine, steer, last: null };

  for (let tick = 0; tick < ticks; tick++) {
    const t = tick * RECORD_DT;

    while (timeline.length && timeline[0].at <= t + 1e-9) follow(follower, timeline.shift()!);

    const poses = engine.poses();
    const driving = logic?.driving ?? true;

    if (driving && steer?.steering) engine.command(steer.command(poses));

    const facts = sample(poses, t);

    logic?.advance(t * 1000, facts);

    if (logic && tick > 0 && tick % JUDGE_EVERY_TICKS === 0) logic.judged(await judge());

    frames.push({ t, poses });
    engine.step(RECORD_DT);
  }

  return frames;
}

function fixedBaseFor(rig: Rig, facts: RobotFacts): Record<string, boolean> | undefined {
  const key = rig.robots[0]?.key;

  return key && facts.morphology === 'fixed' ? { [key]: true } : undefined;
}

interface Refused {
  authored: Case;
  model: SimModel;
  refusal: string;
}

const refused = ({ authored, model, refusal }: Refused): CaseResult => ({
  passed: false,
  margin: -1,
  failed: [],
  trace: { dt: RECORD_DT, signals: {} },
  refusal,
  model,
  frames: [],
  objectIds: [],
  case: authored,
});

function bodyFor(model: SimModel, robot: CaseRobot, options: RunOptions) {
  const kit = options.kit;

  return routineBody(model, robot.joints, { skills: kit?.policies ?? [], drive: kit?.drive }) ?? undefined;
}

type LogicPlan = { plan: Plan | null; refusal?: string };

function logicPlan(kase: Case, options: RunOptions): LogicPlan {
  if (!kase.logic) return { plan: null };

  const skills = options.skills ?? options.kit?.skills ?? [];
  const compiled = compileCaseLogic(kase.logic, { skills, modelHash: options.kit?.modelHash });

  return compiled.ok ? { plan: compiled.plan } : { plan: null, refusal: compiled.errors[0].message };
}

interface LogicStart {
  plan: Plan | null;
  kase: Case;
  engine: SimEngine;
  body: RoutineBody | null;
  handBack: () => void;
  inputs?: CaseInput[];
}

async function startLogic({ plan, kase, engine, body, handBack, inputs }: LogicStart) {
  if (!plan) return null;

  const logic = await CaseLogicRun.start({ plan, seconds: kase.task.seconds, engine, body, handBack });

  for (const event of inputs ?? []) logic.input(event);

  return logic;
}

function factSampler(kase: Case, facts: CaseFactReader, reader: { sample: ProbeSample }, signals: Signals) {
  const names = caseSignalNames(kase);

  return (poses: Float64Array, t: number) => {
    const read = facts.read(poses, t);

    reader.sample(poses, signals);
    sampleSignals(read, names, signals);

    return read;
  };
}

type Signals = Record<string, number[]>;

type ProbeSample = (poses: Float64Array, out: Signals) => void;

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

  if (refusal) return refused({ authored, model: buildMjcf(input), refusal });

  const kase = scaledToReach(authored, facts.reachMm, facts.anchor);
  const world = kase.world.objects.map(worldItem);
  const model = buildMjcf({ ...input, world, fixedBase: fixedBaseFor(rig, facts) });
  const { plan, refusal: logicRefusal } = logicPlan(kase, options);

  if (logicRefusal) return refused({ authored, model, refusal: logicRefusal });

  const body = plan && usesBodySkills(plan) ? bodyFor(model, robot, options) : null;

  if (body === undefined) return refused({ authored, model, refusal: NO_BODY });

  const engine = new SimEngine(mj, model);
  const effector = boundEffector(kase.slot.binding, facts, rig);
  const signals: Signals = {};
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
  const handBack = () => engine.setController(chooseController(setup, options));

  handBack();

  try {
    const logic = await startLogic({ plan, kase, engine, body, handBack, inputs: options.inputs });
    const sample = factSampler(kase, caseFactReader(kase, model), reader, signals);
    const judge = () => judgeSoFar(kase.task.contract, { dt: RECORD_DT, signals });
    const frames = await roll({ engine, kase, steer, sample, logic, judge });
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
      ...(logic ? { logic: logic.result() } : {}),
    };
  } finally {
    engine.dispose();
  }
}
