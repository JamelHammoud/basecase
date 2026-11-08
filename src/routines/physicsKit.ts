import type { MainModule } from '@mujoco/mujoco';
import { modelHashes, type Skill } from '../skills/artifacts';
import type { DriveSetup } from '../sim/drive';
import { modelOf } from '../skills/fixtureModels';
import { SimEngine } from '../sim/engine';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint, RobotPoseState, ScenePart } from '../types/robotics';
import { loadKitLibrary } from './kitLibrary';
import {
  applyControl,
  type BodyControl,
  BodyProbe,
  type BodyPose,
  controlFor,
  LOOK_DEG,
  routineBody,
  type RoutineBody,
} from './physicsBody';
import { scriptedDrive } from './physicsDrive';
import type { Resource, SkillContract, TransitionProof } from './schema';

export interface KitRobot {
  id: string;
  parts: ScenePart[];
  joints: RobotJoint[];
}

export interface RoutineKit {
  skills: SkillContract[];
  modelHash: string;
  problems: Record<string, string>;
  policies: readonly Skill[];
  drive: DriveSetup | null;
}

export interface KitOptions {
  skills?: readonly Skill[];
  model?: SimModel;
}

const PROOF_SEEDS = 8;
const FROM_S = 1.5;
const TO_S = 2;
const STILL_S = 0.5;
const START_NOISE_DEG = 2;
const MIN_WALK_M = 0.08;
const MIN_TURN_RAD = 0.3;
const MAX_STILL_M = 0.02;
const LOOK_TOLERANCE_DEG = 6;
const D2R = Math.PI / 180;
const BODY_SKILLS = ['walk', 'settle', 'turn-away'] as const;
const PAIRS: Array<[string, string]> = [
  ['walk', 'settle'],
  ['settle', 'walk'],
  ['settle', 'turn-away'],
  ['turn-away', 'walk'],
  ['turn-away', 'settle'],
];

interface Sampled {
  start: BodyPose;
  late: BodyPose;
  end: BodyPose;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const travel = (a: BodyPose, b: BodyPose) => Math.hypot(b.base[0] - a.base[0], b.base[1] - a.base[1]);

const DOES: Record<string, (s: Sampled) => boolean> = {
  walk: (s) => travel(s.start, s.end) >= MIN_WALK_M,
  'turn-away': (s) => Math.abs(wrap(s.end.yaw - s.start.yaw)) >= MIN_TURN_RAD,
  settle: (s) => travel(s.late, s.end) <= MAX_STILL_M,
};

function seeded(seed: number) {
  let state = (seed * 2654435761 + 1013904223) >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 2 ** 32;
  };
}

function perturbed(model: SimModel, seed: number): RobotPoseState {
  const random = seeded(seed);
  const values = Object.fromEntries(
    Object.entries(model.initial.values).map(([id, v]) => [id, v + (random() * 2 - 1) * START_NOISE_DEG]),
  );

  return { ...model.initial, values };
}

class Prover {
  readonly falls = new Map<string, number>();
  readonly failed = new Set<string>();
  private readonly engine: SimEngine;
  private readonly probe: BodyProbe;
  private readonly body: RoutineBody;
  private control: BodyControl | null = null;

  constructor(mj: MainModule, body: RoutineBody) {
    this.body = body;
    this.engine = new SimEngine(mj, body.model);
    this.probe = new BodyProbe(mj, this.engine, body);
  }

  private apply(skills: { body: string | null; head: string | null }, previous: BodyControl | null) {
    const next = controlFor(this.body, skills);

    applyControl(this.engine, next, previous);
    this.control = next;
  }

  private start(skills: { body: string | null; head: string | null }, seed: number) {
    this.apply(skills, null);
    this.engine.reset(perturbed(this.body.model, seed));
  }

  private switchTo(skills: { body: string | null; head: string | null }): Sampled {
    const start = this.probe.pose();

    this.apply(skills, this.control);
    this.engine.step(TO_S - STILL_S);

    const late = this.probe.pose();

    this.engine.step(STILL_S);

    return { start, late, end: this.probe.pose() };
  }

  pair(from: string, to: string) {
    const key = `${from}->${to}`;

    for (let seed = 1; seed <= PROOF_SEEDS; seed++) {
      this.start({ body: from, head: null }, seed);
      this.engine.step(FROM_S);

      const sampled = this.switchTo({ body: to, head: null });

      if (this.probe.fellAt() !== null) this.falls.set(key, (this.falls.get(key) ?? 0) + 1);

      if (!DOES[to](sampled)) this.failed.add(to);
    }
  }

  look() {
    const neck = this.body.neck;

    for (let seed = 1; seed <= PROOF_SEEDS && neck; seed++) {
      this.start({ body: 'walk', head: null }, seed);
      this.engine.step(FROM_S);
      this.switchTo({ body: 'walk', head: 'look-at' });

      const off = Math.abs(this.probe.joint(neck) / D2R - LOOK_DEG);

      if (this.probe.fellAt() !== null || Number.isNaN(off) || off > LOOK_TOLERANCE_DEG) this.failed.add('look-at');
    }
  }

  dispose() {
    this.engine.dispose();
  }
}

const contract = (id: string, holds: Resource[], rest: Partial<SkillContract>): SkillContract => ({
  id,
  status: 'needsTraining',
  rateHz: 50,
  holds,
  startsFrom: ['standing'],
  endsIn: 'standing',
  interrupt: 'any',
  stopVia: 'settle',
  transitions: {},
  ...rest,
});

function hasController(body: RoutineBody, skill: string): boolean {
  if (skill === 'look-at') return body.neck !== null && body.policies.velocity !== null;

  const policy = skill === 'settle' ? body.policies.settle : body.policies.velocity;

  return policy !== null || body.drive !== null;
}

const SHAPES: Record<string, { holds: Resource[]; rest: Partial<SkillContract> }> = {
  walk: { holds: ['body'], rest: { interrupt: 'atPhase', endsIn: 'walking' } },
  settle: { holds: ['body'], rest: { startsFrom: ['standing', 'walking'] } },
  'turn-away': { holds: ['body'], rest: {} },
  'look-at': { holds: ['head'], rest: { stopVia: 'look-at' } },
};

const REASONS = {
  missing: 'No Motor Kit policy runs this skill on this robot.',
  failed: 'Its Motor Kit policy didn’t do this in simulation.',
  neck: 'This robot has no neck joint to look with.',
};

function reasonFor(body: RoutineBody, skill: string, prover: Prover | null): string | null {
  if (skill === 'look-at' && !body.neck) return REASONS.neck;

  if (!hasController(body, skill)) return REASONS.missing;

  return prover?.failed.has(skill) ? REASONS.failed : null;
}

function kitContracts(
  body: RoutineBody | null,
  prover: Prover | null,
  modelHash: string,
): Omit<RoutineKit, 'policies' | 'drive'> {
  const problems: Record<string, string> = {};
  const skills = [...BODY_SKILLS, 'look-at'].map((id) => {
    const reason = body ? reasonFor(body, id, prover) : 'Only a robot that walks on legs runs the Motor Kit.';
    const proofs: Record<string, TransitionProof> = Object.fromEntries(
      PAIRS.filter(([from]) => from === id && !reason).map(([, to]) => [
        to,
        { seeds: PROOF_SEEDS, falls: prover?.falls.get(`${id}->${to}`) ?? 0, modelHash },
      ]),
    );

    if (reason) problems[id] = reason;

    return contract(id, SHAPES[id].holds, {
      ...SHAPES[id].rest,
      status: reason ? 'needsTraining' : 'ready',
      transitions: proofs,
    });
  });

  return { skills, modelHash, problems };
}

function prove(mj: MainModule, body: RoutineBody): Prover | null {
  const drivable = !!body.drive || (!!body.policies.velocity && !!body.policies.settle);

  if (!drivable) return null;

  const prover = new Prover(mj, body);

  try {
    for (const [from, to] of PAIRS) prover.pair(from, to);

    prover.look();
  } finally {
    prover.dispose();
  }

  return prover;
}

const cache = new Map<string, RoutineKit>();

const libraryKey = (skills: readonly Skill[]) =>
  skills.map((s) => (s.controller.kind === 'policy' ? `${s.name}:${s.controller.policy.createdAt}` : s.name)).join('|');

export function kitForModel(options: {
  mj: MainModule;
  model: SimModel;
  joints: RobotJoint[];
  skills: readonly Skill[];
  drive?: DriveSetup | null;
}): RoutineKit {
  const { mj, model, joints, skills } = options;
  const drive = options.drive ?? null;
  const modelHash = modelHashes(model).physics;
  const key = `${modelHash}#${libraryKey(skills)}#${drive?.kind ?? ''}`;
  const known = cache.get(key);

  if (known) return known;

  const body = routineBody(model, joints, { skills, drive });
  const kit = { ...kitContracts(body, body && prove(mj, body), modelHash), policies: [...skills], drive };

  cache.set(key, kit);

  return kit;
}

export async function routineKit(mj: MainModule, robot: KitRobot, options: KitOptions = {}): Promise<RoutineKit> {
  const skills = options.skills ?? (await loadKitLibrary());
  const model = options.model ?? modelOf(robot);
  const drive = scriptedDrive(model, robot.joints, robot.parts);

  return kitForModel({ mj, model, joints: robot.joints, skills, drive });
}
