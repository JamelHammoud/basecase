import type { MainModule } from '@mujoco/mujoco';
import type { DriveCommand, DriveSetup } from '../sim/drive';
import { rigForWorker } from '../sim/drive';
import { policyCommand, type VelocityDrive } from '../sim/driveAccess';
import { footPoints } from '../sim/driveLegs';
import { armSetup, roverForward, roverSetup } from '../sim/driveSetup';
import { SimEngine, type Controller } from '../sim/engine';
import { buildMjcf } from '../sim/mjcf';
import type { MjcfInput, SimModel } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig, type Rig, type V3 } from '../utils/kinematics';
import { ArenaWorld } from '../skills/arenaWorld';
import { evaluateContract, type Trace } from '../skills/contract';
import type { Randomization } from '../skills/environment';
import { CASE_RANDOMIZATION, caseInstance, caseRandom, jitteredWorld } from './caseRandom';
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
  seed?: number;
  randomization?: Randomization;
  walk?: VelocityDrive | null;
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
    const { armJoints: joints, anchor, reachMm, gripper } = facts;

    return armSetup({ rig, robot: key, effector, joints, anchor, reachMm, grip: gripper });
  }

  return groundDrive(rig, robot, facts, key);
}

const LEGS_FORWARD: V3 = [0, 0, 1];

interface SteerFor {
  fit: Fitted;
  model: SimModel;
  objectAt: Map<string, V3>;
}

function steerWay({ setup, walk, wheelAxes }: Fitted): { forward: V3; sideways: boolean } | null {
  if (walk || setup?.kind === 'legs') return { forward: LEGS_FORWARD, sideways: true };

  return setup?.kind === 'rover' ? { forward: roverForward(wheelAxes).toArray() as V3, sideways: false } : null;
}

function steerFor({ fit, model, objectAt }: SteerFor): GroundSteer | null {
  const way = steerWay(fit);
  const { part, point } = fit.probeBase;

  return way && part ? new GroundSteer({ model, part, point, objectAt, ...way }) : null;
}

const toCommand = (c: ReferenceCommand): DriveCommand => ({ v: c.v ?? [0, 0, 0], target: c.target, aux: c.aux });

function chooseController({ setup, walk, rig }: Fitted): Controller {
  if (walk) return { kind: 'policy', policy: walk.policy, robot: rig.robots[0]?.key ?? '' };

  return setup ? { kind: 'drive', setup } : { kind: 'limp' };
}

function walkFor(setup: DriveSetup | null, facts: RobotFacts, options: RunOptions): VelocityDrive | null {
  const floating = facts.morphology !== 'fixed';

  return options.controller === 'reference' && floating && setup?.kind !== 'arm' ? (options.walk ?? null) : null;
}

interface Rollout {
  engine: SimEngine;
  kase: Case;
  steer: GroundSteer | null;
  send: (c: DriveCommand) => void;
  sample: (poses: Float64Array) => void;
}

function follow({ steer, send }: Rollout, c: ReferenceCommand) {
  if (!steer) return send(toCommand(c));

  if (c.target) return steer.add(c.target, { speed: c.v?.[0], push: c.push });

  steer.clear();
  send(toCommand(c));
}

function roll(rollout: Rollout): CaseFrame[] {
  const { engine, kase, steer, send, sample } = rollout;
  const timeline = [...kase.reference.timeline].sort((a, b) => a.at - b.at);
  const frames: CaseFrame[] = [];
  const ticks = Math.round(kase.task.seconds / RECORD_DT);

  for (let tick = 0; tick < ticks; tick++) {
    const t = tick * RECORD_DT;

    while (timeline.length && timeline[0].at <= t + 1e-9) follow(rollout, timeline.shift()!);

    const poses = engine.poses();

    if (steer?.steering) send(steer.command(poses));

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

interface Started {
  engine: SimEngine;
  dispose: () => void;
}

function startEngine(mj: MainModule, model: SimModel, run: { controller: Controller; options: RunOptions }): Started {
  const { controller, options } = run;
  const random = options.seed === undefined ? null : caseRandom(options.seed);

  if (!random) {
    const engine = new SimEngine(mj, model);

    engine.setController(controller);

    return { engine, dispose: () => engine.dispose() };
  }

  const arena = new ArenaWorld(mj, model);
  const instance = caseInstance(random, {
    randomization: options.randomization ?? CASE_RANDOMIZATION,
    bodies: arena.engine.model.nbody - 1,
  });

  arena.prepare({ instance, controller: { kind: 'hold' }, start: model.initial, robot: model.robots[0]?.key ?? '' });
  arena.engine.setController(controller);

  return { engine: arena.engine, dispose: () => arena.dispose() };
}

const worldRandom = (seed: number | undefined) => (seed === undefined ? null : caseRandom(-seed - 1));

function refused(authored: Case, refusal: string, input: MjcfInput): CaseResult {
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
}

interface Fitted {
  input: MjcfInput;
  rig: Rig;
  facts: RobotFacts;
  scaled: Case;
  effector: EndEffector | null;
  probeBase: ProbeBase;
  setup: DriveSetup | null;
  walk: VelocityDrive | null;
  wheelAxes: V3[];
}

function fitted(authored: Case, robot: CaseRobot, options: RunOptions): Fitted | { refusal: string; input: MjcfInput } {
  const rig = buildRig(robot.joints, robot.parts);
  const facts = robotFacts(rig, robot.parts);
  const refusal = slotRefusal(authored.slot, facts);
  const input: MjcfInput = {
    parts: robot.parts,
    rig,
    project: DEFAULT_PROJECT,
    measures: robot.measures,
    partTriangles: robot.partTriangles,
  };

  if (refusal) return { refusal, input };

  const scaled = scaledToReach(authored, facts.reachMm, facts.anchor);
  const effector = boundEffector(scaled.slot.binding, facts, rig);
  const setup = options.controller === 'reference' ? driveFor({ kase: scaled, rig, robot, facts, effector }) : null;
  const wheelAxes = facts.wheels.flatMap((id): V3[] => {
    const axis = rig.byId.get(id)?.axis;

    return axis ? [axis] : [];
  });
  const probeBase: ProbeBase = {
    part: robot.parts.find((p) => !rig.ownerOf.has(p.id))?.id ?? null,
    point: rig.robots[0]?.pivot ?? ([0, 0, 0] as V3),
  };

  const walk = walkFor(setup, facts, options);

  return { input, rig, facts, scaled, effector, probeBase, setup, walk, wheelAxes };
}

async function rollFitted(mj: MainModule, fit: Fitted, options: RunOptions): Promise<CaseResult> {
  const jitter = worldRandom(options.seed);
  const kase = jitter ? jitteredWorld(fit.scaled, jitter) : fit.scaled;
  const world = kase.world.objects.map(worldItem);
  const model = buildMjcf({ ...fit.input, world, fixedBase: fixedBaseFor(fit.rig, fit.facts) });
  const signals: Record<string, number[]> = {};
  const objectAt = new Map(kase.world.objects.map((o) => [o.id, o.position]));
  const { probeBase, walk } = fit;
  const reader = probeReader(kase.task.probes, {
    model,
    effector: fit.effector,
    basePart: probeBase.part,
    basePoint: probeBase.point,
    objectAt,
  });
  const steer = steerFor({ fit, model, objectAt });
  const controller = chooseController(fit);
  const { engine, dispose } = startEngine(mj, model, { controller, options });
  const send = (c: DriveCommand) => engine.command(walk ? policyCommand(c, walk.topSpeed) : c);

  try {
    const frames = roll({ engine, kase, steer, send, sample: (poses) => reader.sample(poses, signals) });
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
    dispose();
  }
}

export interface CaseRunner {
  refusal: string | null;
  controller: Controller['kind'];
  run: (seed?: number) => Promise<CaseResult>;
}

export function caseRunner(mj: MainModule, authored: Case, robot: CaseRobot, options: RunOptions): CaseRunner {
  const fit = fitted(authored, robot, options);

  if ('refusal' in fit) {
    return { refusal: fit.refusal, controller: 'limp', run: async () => refused(authored, fit.refusal, fit.input) };
  }

  return {
    refusal: null,
    controller: chooseController(fit).kind,
    run: (seed = options.seed) => rollFitted(mj, fit, { ...options, seed }),
  };
}

export const runCase = (mj: MainModule, authored: Case, robot: CaseRobot, options: RunOptions): Promise<CaseResult> =>
  caseRunner(mj, authored, robot, options).run();
