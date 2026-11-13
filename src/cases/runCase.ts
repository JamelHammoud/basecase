import type { MainModule } from '@mujoco/mujoco';
import type { DriveCommand, DriveSetup, RobotDrive } from '../sim/drive';
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
import { castRobot, castSlots, guestsOf, type CaseRobot, type CastSlot, type NamedSlot } from './caseCast';
import { robotFacts, type RobotFacts } from './robotFit';
import { scaledToReach } from './scale';
import { caseSlots, worldItem, type Case, type ReferenceCommand } from './schema';
import { slotRefusals } from './slots';

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
}

interface ProbeBase {
  part: string | null;
  point: V3;
}

export interface RunOptions {
  controller: 'limp' | 'reference';
  partners?: CaseRobot[];
  limp?: string[];
}

interface DriveFor {
  slot: NamedSlot;
  cast: CastSlot;
  rig: Rig;
  parts: MjcfInput['parts'];
}

const MIN_DRIVEN_FEET = 4;

function groundDrive(rig: Rig, parts: MjcfInput['parts'], facts: RobotFacts, key: string): RobotDrive | null {
  if (facts.morphology === 'legged') {
    const feet = footPoints(rig, parts, key);

    return feet.length >= MIN_DRIVEN_FEET
      ? { kind: 'legs', robot: key, rig: rigForWorker(rig), feet, start: {} }
      : null;
  }

  return facts.wheels.length ? roverSetup(rig, parts, key) : null;
}

export function driveFor({ slot, cast, rig, parts }: DriveFor): RobotDrive | null {
  const { facts, effector } = cast;
  const key = cast.key ?? '';

  if (slot.needs.includes('arm') && effector && facts.armJoints.length) {
    const { armJoints: joints, anchor, reachMm } = facts;

    return armSetup({ rig, robot: key, effector, joints, anchor, reachMm });
  }

  return groundDrive(rig, parts, facts, key);
}

export function teamDrive(setups: Array<RobotDrive | null>): DriveSetup | null {
  if (setups.length < 2) return setups[0] ?? null;

  const members = setups.flatMap((setup, slot) => (setup ? [{ slot, setup }] : []));

  return members.length ? { kind: 'team', members } : null;
}

const LEGS_FORWARD: V3 = [0, 0, 1];

interface SteerFor {
  setup: RobotDrive | null;
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

export const slotIndexOf = (kase: Case, c: ReferenceCommand) =>
  Math.max(
    0,
    caseSlots(kase).findIndex((s) => s.id === c.slot),
  );

export const toCommand = (c: ReferenceCommand, slot = 0): DriveCommand => ({
  ...(slot ? { slot } : {}),
  v: c.v ?? [0, 0, 0],
  target: c.target,
  aux: c.aux,
});

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

function follow(engine: SimEngine, steer: GroundSteer | null, c: ReferenceCommand, slot: number) {
  if (!steer || slot) return engine.command(toCommand(c, slot));

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

    while (timeline.length && timeline[0].at <= t + 1e-9) {
      const c = timeline.shift()!;

      follow(engine, steer, c, slotIndexOf(kase, c));
    }

    const poses = engine.poses();

    if (steer?.steering) engine.command(steer.command(poses));

    sample(poses);
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

function refused(authored: Case, robot: CaseRobot, refusal: string): CaseResult {
  const rig = buildRig(robot.joints, robot.parts);
  const input = { parts: robot.parts, rig, project: DEFAULT_PROJECT, measures: robot.measures };

  return {
    passed: false,
    margin: -1,
    failed: [],
    trace: { dt: RECORD_DT, signals: {} },
    refusal,
    model: buildMjcf({ ...input, partTriangles: robot.partTriangles }),
    frames: [],
    objectIds: [],
    case: authored,
  };
}

export async function runCase(
  mj: MainModule,
  authored: Case,
  robot: CaseRobot,
  options: RunOptions,
): Promise<CaseResult> {
  const partners = options.partners ?? [];
  const lead = ownFacts(robot)!;
  const refusal = slotRefusals(caseSlots(authored), [lead, ...partners.map(ownFacts)]).find(Boolean);

  if (refusal) return refused(authored, robot, refusal);

  const kase = scaledToReach(authored, lead.reachMm, lead.anchor);
  const slots = caseSlots(kase);
  const guests = guestsOf(slots, partners).map((g, i) => ({ ...g, robot: partners[i] }));
  const team = castRobot(robot, guests);
  const rig = buildRig(team.joints, team.parts);
  const cast = castSlots(slots, { rig, parts: team.parts, guests });
  const world = kase.world.objects.map(worldItem);
  const input = { parts: team.parts, rig, project: DEFAULT_PROJECT, measures: team.measures };
  const model = buildMjcf({ ...input, partTriangles: team.partTriangles, world, fixedBase: fixedBaseFor(cast) });
  const engine = new SimEngine(mj, model);
  const signals: Record<string, number[]> = {};
  const leadRobot = rig.robots.find((r) => r.key === cast[0].key);
  const probeBase: ProbeBase = {
    part: robot.parts.find((p) => !rig.ownerOf.has(p.id))?.id ?? null,
    point: leadRobot?.pivot ?? ([0, 0, 0] as V3),
  };
  const objectAt = new Map(kase.world.objects.map((o) => [o.id, o.position]));
  const reader = probeReader(kase.task.probes, {
    model,
    effector: cast[0].effector,
    effectors: Object.fromEntries(cast.map((c) => [c.id, c.effector])),
    basePart: probeBase.part,
    basePoint: probeBase.point,
    objectAt,
  });
  const setups =
    options.controller === 'reference'
      ? slots.map((slot, i) => driveFor({ slot, cast: cast[i], rig, parts: team.parts }))
      : [];
  const wheelAxes = cast[0].facts.wheels.flatMap((id): V3[] => {
    const axis = rig.byId.get(id)?.axis;

    return axis ? [axis] : [];
  });
  const steer = steerFor({ setup: setups[0] ?? null, model, base: probeBase, wheelAxes, objectAt });

  engine.setController(chooseController(teamDrive(setups), options));
  limpen(engine, model, new Set(cast.flatMap((c) => (c.key && options.limp?.includes(c.id) ? [c.key] : []))));

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
