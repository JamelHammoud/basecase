import type { MainModule } from '@mujoco/mujoco';
import type { DriveCommand, RobotDrive } from '../sim/drive';
import { policyCommand, type VelocityDrive } from '../sim/driveAccess';
import { roverForward } from '../sim/driveSetup';
import { SimEngine, type Controller } from '../sim/engine';
import { buildMjcf } from '../sim/mjcf';
import type { MjcfInput, SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import { Recorder, type Recording } from '../sim/recorder';
import { torqueShare } from '../sim/torqueShare';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig, type Rig, type V3 } from '../utils/kinematics';
import { ArenaWorld } from '../skills/arenaWorld';
import { evaluateContract, type Trace } from '../skills/contract';
import type { Randomization } from '../skills/environment';
import { NO_BODY } from '../routines/physicsBody';
import { caseFactReader, type CaseFacts } from './caseFacts';
import { caseCommand } from './caseTarget';
import { judgeSoFar, usesBodySkills, type CaseLogicResult, type CaseLogicRun } from './caseLogic';
import { CASE_RANDOMIZATION, caseInstance, caseRandom, jitteredWorld, worldRandom } from './caseRandom';
import { GroundSteer } from './groundSteer';
import { probeReader, type ProbeWorld } from './probes';
import { NO_PATH, runPath } from './runPath';
import { castRobot, castSlots, guestsOf, type CaseRobot, type CastSlot } from './caseCast';
import { driveFor, slotIndexOf, teamDrive, toCommand } from './caseDrives';
import { robotFacts, type EndEffector, type RobotFacts } from './robotFit';
import { bodyFor, factSampler, logicPlan, startLogic, type LogicOptions, type Signals } from './runCaseLogic';
import { scaledToReach } from './scale';
import { reseededGround } from './terrain';
import { caseSlots, worldItem, type Case, type ReferenceCommand } from './schema';
import { slotRefusals } from './slots';
import { WorldMoves } from '../sim/worldMoves';
import type { WorldEvent } from './worldSet';

export type { CaseRobot } from './caseCast';

export const RECORD_DT = 0.02;

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
  recording?: Recording;
  path: Float32Array;
}

interface ProbeBase {
  part: string | null;
  point: V3;
}

export interface RunOptions extends LogicOptions {
  controller: 'limp' | 'reference' | 'policy';
  seed?: number;
  randomization?: Randomization;
  jointNoiseDeg?: number;
  policy?: PolicySpec | null;
  record?: boolean;
  walk?: VelocityDrive | null;
  partners?: CaseRobot[];
  limp?: string[];
  world?: WorldEvent[];
}

const JUDGE_EVERY_TICKS = 12;

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

function chooseController({ setups, walk, rig }: Fitted): Controller {
  if (walk) return { kind: 'policy', policy: walk.policy, robot: rig.robots[0]?.key ?? '' };

  const team = teamDrive(setups);

  return team ? { kind: 'drive', setup: team } : { kind: 'limp' };
}

function runController(fit: Fitted, kase: Case, options: RunOptions): Controller {
  if (options.controller !== 'policy' || !options.policy) return chooseController(fit);

  return {
    kind: 'policy',
    policy: { ...options.policy, command: caseCommand(kase) },
    robot: fit.rig.robots[0]?.key ?? '',
  };
}

const withoutReference = (kase: Case): Case => ({ ...kase, reference: { timeline: [] } });

function walkFor(setup: RobotDrive | null, facts: RobotFacts, options: RunOptions): VelocityDrive | null {
  const floating = facts.morphology !== 'fixed';

  return options.controller === 'reference' && floating && setup?.kind !== 'arm' ? (options.walk ?? null) : null;
}

interface Rollout {
  engine: SimEngine;
  kase: Case;
  steer: GroundSteer | null;
  send: (c: DriveCommand) => void;
  sample: (poses: Float64Array, t: number, torque?: number) => CaseFacts;
  logic: CaseLogicRun | null;
  judge: () => Promise<CaseFacts>;
  changes: { world: WorldMoves; events: WorldEvent[]; record: (e: WorldEvent) => void };
}

function follow({ engine, steer, send }: Rollout, c: ReferenceCommand, slot: number) {
  if (slot) return engine.command(toCommand(c, slot));

  if (!steer) return send(toCommand(c));

  if (c.target) return steer.add(c.target, { speed: c.v?.[0], push: c.push });

  steer.clear();
  send(toCommand(c));
}

function changeWorld(changes: Rollout['changes'], events: WorldEvent[], t: number) {
  while (events.length && events[0].at <= t + 1e-9) {
    const e = events.shift()!;

    if (!changes.world.apply(e)) changes.record(e);
  }
}

async function roll(rollout: Rollout): Promise<CaseFrame[]> {
  const { engine, kase, steer, send, sample, logic, judge, changes } = rollout;
  const timeline = [...kase.reference.timeline].sort((a, b) => a.at - b.at);
  const events = [...changes.events].sort((a, b) => a.at - b.at);
  const frames: CaseFrame[] = [];
  const ticks = Math.round(kase.task.seconds / RECORD_DT);

  for (let tick = 0; tick < ticks; tick++) {
    const t = tick * RECORD_DT;

    while (timeline.length && timeline[0].at <= t + 1e-9) {
      const c = timeline.shift()!;

      follow(rollout, c, slotIndexOf(kase, c));
    }

    changeWorld(changes, events, t);
    engine.refreshKinematics();

    const poses = engine.poses();
    const driving = logic?.driving ?? true;

    if (driving && steer?.steering) send(steer.command(poses));

    const facts = sample(poses, t, torqueShare(engine));

    logic?.advance(t * 1000, facts);

    if (logic && tick > 0 && tick % JUDGE_EVERY_TICKS === 0) logic.judged(await judge());

    frames.push({ t, poses });
    engine.step(RECORD_DT);
  }

  return frames;
}

function fixedBaseFor(slots: CastSlot[]): Record<string, boolean> | undefined {
  const fixed = slots.flatMap((s) => (s.key && s.facts.morphology === 'fixed' ? [[s.key, true] as const] : []));

  return fixed.length ? Object.fromEntries(fixed) : undefined;
}

function limpen(engine: SimEngine, model: SimModel, keys: Set<string>) {
  const range = engine.model.actuator_forcerange;

  for (const j of model.joints)
    if (keys.has(j.robot) && j.actuator >= 0) range.fill(0, j.actuator * 2, j.actuator * 2 + 2);
}

const ownFacts = (robot: CaseRobot | undefined) =>
  robot ? robotFacts(buildRig(robot.joints, robot.parts), robot.parts) : null;

export interface Started {
  engine: SimEngine;
  dispose: () => void;
}

export interface EngineStart {
  controller: Controller;
  seed?: number;
  randomization?: Randomization;
  jointNoiseDeg?: number;
}

export function startEngine(mj: MainModule, model: SimModel, options: EngineStart): Started {
  const { controller } = options;
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
    joints: arena.engine.sim.joints.length,
    jointNoiseDeg: options.jointNoiseDeg,
  });

  arena.prepare({ instance, controller: { kind: 'hold' }, start: model.initial, robot: model.robots[0]?.key ?? '' });
  arena.engine.setController(controller);

  return { engine: arena.engine, dispose: () => arena.dispose() };
}

function refused(authored: Case, refusal: string, model: SimModel): CaseResult {
  return {
    passed: false,
    margin: -1,
    failed: [],
    trace: { dt: RECORD_DT, signals: {} },
    refusal,
    model,
    frames: [],
    objectIds: [],
    case: authored,
    path: NO_PATH,
  };
}

interface Fitted {
  robot: CaseRobot;
  input: MjcfInput;
  rig: Rig;
  facts: RobotFacts;
  scaled: Case;
  cast: CastSlot[];
  effector: EndEffector | null;
  probeBase: ProbeBase;
  setup: RobotDrive | null;
  setups: Array<RobotDrive | null>;
  walk: VelocityDrive | null;
  wheelAxes: V3[];
}

function ownInput(robot: CaseRobot): MjcfInput {
  const rig = buildRig(robot.joints, robot.parts);

  return {
    parts: robot.parts,
    rig,
    project: DEFAULT_PROJECT,
    measures: robot.measures,
    partTriangles: robot.partTriangles,
    servoVolts: robot.servoVolts,
  };
}

function fitted(authored: Case, robot: CaseRobot, options: RunOptions): Fitted | { refusal: string; input: MjcfInput } {
  const partners = options.partners ?? [];
  const lead = ownFacts(robot)!;
  const refusal = slotRefusals(caseSlots(authored), [lead, ...partners.map(ownFacts)]).find(Boolean);

  if (refusal) return { refusal, input: ownInput(robot) };

  const scaled = scaledToReach(authored, lead.reachMm, lead.anchor);
  const slots = caseSlots(scaled);
  const guests = guestsOf(slots, partners).map((g, i) => ({ ...g, robot: partners[i] }));
  const team = castRobot(robot, guests);
  const rig = buildRig(team.joints, team.parts);
  const cast = castSlots(slots, { rig, parts: team.parts, guests });
  const input: MjcfInput = { ...ownInput(team), rig };
  const { facts, effector } = cast[0];
  const setups =
    options.controller === 'reference'
      ? slots.map((slot, i) => driveFor({ slot, cast: cast[i], rig, parts: team.parts }))
      : [];
  const setup = setups[0] ?? null;
  const wheelAxes = facts.wheels.flatMap((id): V3[] => {
    const axis = rig.byId.get(id)?.axis;

    return axis ? [axis] : [];
  });
  const probeBase: ProbeBase = {
    part: robot.parts.find((p) => !rig.ownerOf.has(p.id))?.id ?? null,
    point: rig.robots.find((r) => r.key === cast[0].key)?.pivot ?? ([0, 0, 0] as V3),
  };
  const walk = walkFor(setup, facts, options);

  return { robot, input, rig, facts, scaled, cast, effector, probeBase, setup, setups, walk, wheelAxes };
}

async function rollFitted(mj: MainModule, fit: Fitted, options: RunOptions): Promise<CaseResult> {
  const jitter = options.seed === undefined ? null : worldRandom(options.seed);
  const kase = jitter ? reseededGround(jitteredWorld(fit.scaled, jitter), jitter) : fit.scaled;
  const world = kase.world.objects.map(worldItem);
  const model = buildMjcf({ ...fit.input, world, fixedBase: fixedBaseFor(fit.cast) });
  const { plan, refusal: logicRefusal } = logicPlan(kase, options);

  if (logicRefusal) return refused(fit.scaled, logicRefusal, model);

  const body = plan && usesBodySkills(plan) ? bodyFor(model, fit.robot.joints, options) : null;

  if (body === undefined) return refused(fit.scaled, NO_BODY, model);

  const signals: Signals = {};
  const objectAt = new Map(kase.world.objects.map((o) => [o.id, o.position]));
  const { probeBase, walk } = fit;
  const probeWorld: ProbeWorld = {
    model,
    effector: fit.effector,
    effectors: Object.fromEntries(fit.cast.map((c) => [c.id, c.effector])),
    basePart: probeBase.part,
    basePoint: probeBase.point,
    objectAt,
  };
  const reader = probeReader(kase.task.probes, probeWorld);
  const steer = steerFor({ fit, model, objectAt });
  const controller = runController(fit, kase, options);
  const { engine, dispose } = startEngine(mj, model, {
    controller,
    seed: options.seed,
    randomization: options.randomization,
    jointNoiseDeg: options.jointNoiseDeg,
  });
  const recorder = options.record ? new Recorder(engine) : null;
  const changes = {
    world: new WorldMoves(mj, engine),
    events: options.world ?? [],
    record: (e: WorldEvent) => recorder?.worldChange(e),
  };
  const send = (c: DriveCommand) => engine.command(walk ? policyCommand(c, walk.topSpeed) : c);
  const limp = new Set(fit.cast.flatMap((c) => (c.key && options.limp?.includes(c.id) ? [c.key] : [])));

  limpen(engine, model, limp);
  engine.stepHook = recorder?.hook ?? null;

  const handBack = () => engine.setController(controller);

  try {
    const logic = await startLogic({ plan, kase, engine, body, handBack, inputs: options.inputs });
    const sample = factSampler(kase, caseFactReader(kase, model), reader, signals);
    const judge = () => judgeSoFar(kase.task.contract, { dt: RECORD_DT, signals });
    const driven = controller.kind === 'policy' ? withoutReference(kase) : kase;
    const frames = await roll({ engine, kase: driven, steer, send, sample, logic, judge, changes });
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
      path: runPath(frames, { dt: RECORD_DT, world: probeWorld, fixed: fit.facts.morphology === 'fixed' }),
      ...(logic ? { logic: logic.result() } : {}),
      ...(recorder ? { recording: recorder.finish() } : {}),
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
    return {
      refusal: fit.refusal,
      controller: 'limp',
      run: async () => refused(authored, fit.refusal, buildMjcf(fit.input)),
    };
  }

  return {
    refusal: null,
    controller: runController(fit, fit.scaled, options).kind,
    run: (seed = options.seed) => rollFitted(mj, fit, { ...options, seed }),
  };
}

export const runCase = (mj: MainModule, authored: Case, robot: CaseRobot, options: RunOptions): Promise<CaseResult> =>
  caseRunner(mj, authored, robot, options).run();
