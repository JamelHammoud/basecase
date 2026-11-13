import type { MainModule } from '@mujoco/mujoco';
import { modelHashes, type Skill } from '../skills/artifacts';
import { hashOf } from '../skills/hash';
import type { SkillStates } from '../skills/environment';
import type { DriveSetup } from '../sim/drive';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { LOOK_DEG, routineBody, type RoutineBody } from './physicsBody';
import { atKitPhase, atRandomPhase, PROOF_SEEDS, Prover, type Sampled } from './physicsProver';
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

export interface KitScene {
  mj: MainModule;
  model: SimModel;
  joints: RobotJoint[];
  skills: readonly Skill[];
  drive?: DriveSetup | null;
}

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
const HANDOFF_STATES = 32;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const travel = (a: Sampled['start'], b: Sampled['start']) => Math.hypot(b.base[0] - a.base[0], b.base[1] - a.base[1]);

const DOES: Record<string, (s: Sampled) => boolean> = {
  walk: (s) => travel(s.start, s.end) >= MIN_WALK_M,
  'turn-away': (s) => Math.abs(wrap(s.end.yaw - s.start.yaw)) >= MIN_TURN_RAD,
  settle: (s) => travel(s.late, s.end) <= MAX_STILL_M,
};

interface KitProof {
  falls: Map<string, number>;
  failed: Set<string>;
}

const isKitPair = (from: string, to: string) => PAIRS.some(([a, b]) => a === from && b === to);

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

const KIT_IDS = new Set<string>([...BODY_SKILLS, 'look-at']);

const REASONS = {
  missing: 'No Motor Kit policy runs this skill on this robot.',
  failed: 'Its Motor Kit policy didn’t do this in simulation.',
  neck: 'This robot has no neck joint to look with.',
};

function reasonFor(body: RoutineBody, skill: string, proof: KitProof | null): string | null {
  if (skill === 'look-at' && !body.neck) return REASONS.neck;

  if (!hasController(body, skill)) return REASONS.missing;

  return proof?.failed.has(skill) ? REASONS.failed : null;
}

const ownContracts = (body: RoutineBody | null): SkillContract[] =>
  Object.keys(body?.skills ?? {})
    .filter((id) => !KIT_IDS.has(id))
    .map((id) => contract(id, ['body'], { status: 'ready' }));

function kitContracts(
  body: RoutineBody | null,
  proof: KitProof | null,
  modelHash: string,
): Omit<RoutineKit, 'policies' | 'drive'> {
  const problems: Record<string, string> = {};
  const skills = [...BODY_SKILLS, 'look-at'].map((id) => {
    const reason = body ? reasonFor(body, id, proof) : 'Only a robot that walks on legs runs the Motor Kit.';
    const proofs: Record<string, TransitionProof> = Object.fromEntries(
      PAIRS.filter(([from]) => from === id && !reason).map(([, to]) => [
        to,
        { seeds: PROOF_SEEDS, falls: proof?.falls.get(`${id}->${to}`) ?? 0, modelHash },
      ]),
    );

    if (reason) problems[id] = reason;

    return contract(id, SHAPES[id].holds, {
      ...SHAPES[id].rest,
      status: reason ? 'needsTraining' : 'ready',
      transitions: proofs,
    });
  });

  return { skills: [...skills, ...ownContracts(body)], modelHash, problems };
}

function lookFailed(prover: Prover): boolean {
  for (let seed = 1; seed <= PROOF_SEEDS && prover.neck; seed++) {
    const { fell, neckRad } = prover.looked(seed);
    const off = Math.abs(neckRad / D2R - LOOK_DEG);

    if (fell || Number.isNaN(off) || off > LOOK_TOLERANCE_DEG) return true;
  }

  return false;
}

const drivable = (body: RoutineBody) => !!body.drive || (!!body.policies.velocity && !!body.policies.settle);

function proveKit(mj: MainModule, body: RoutineBody): KitProof | null {
  if (!drivable(body)) return null;

  const prover = new Prover(mj, body);
  const proof: KitProof = { falls: new Map(), failed: new Set() };

  try {
    for (const [from, to] of PAIRS) {
      const run = prover.run(from, to, atKitPhase);

      if (run.falls) proof.falls.set(`${from}->${to}`, run.falls);

      if (!run.sampled.every(DOES[to])) proof.failed.add(to);
    }

    if (lookFailed(prover)) proof.failed.add('look-at');
  } finally {
    prover.dispose();
  }

  return proof;
}

const cache = new Map<string, RoutineKit>();

const libraryKey = (skills: readonly Skill[]) =>
  skills
    .map((s) => `${s.name}:${s.controller.kind === 'policy' ? s.controller.policy.createdAt : hashOf(s.controller)}`)
    .join('|');

export function kitForModel(options: KitScene): RoutineKit {
  const { mj, model, joints, skills } = options;
  const drive = options.drive ?? null;
  const modelHash = modelHashes(model).physics;
  const key = `${modelHash}#${libraryKey(skills)}#${drive?.kind ?? ''}`;
  const known = cache.get(key);

  if (known) return known;

  const body = routineBody(model, joints, { skills, drive });
  const kit = { ...kitContracts(body, body && proveKit(mj, body), modelHash), policies: [...skills], drive };

  cache.set(key, kit);

  return kit;
}

const runs = (body: RoutineBody, skill: string) =>
  KIT_IDS.has(skill) ? hasController(body, skill) : body.skills[skill] !== undefined;

function runnable(scene: KitScene, skills: string[]): { prover: Prover; joints: string[] } | null {
  const body = routineBody(scene.model, scene.joints, { skills: scene.skills, drive: scene.drive ?? null });

  if (!body || !drivable(body) || !skills.every((s) => runs(body, s))) return null;

  return { prover: new Prover(scene.mj, body), joints: body.model.joints.map((j) => j.id) };
}

export function proveHandoff(scene: KitScene, pair: { from: string; to: string }): TransitionProof | null {
  const { prover } = runnable(scene, [pair.from, pair.to]) ?? {};

  if (!prover) return null;

  try {
    const run = prover.run(pair.from, pair.to, isKitPair(pair.from, pair.to) ? atKitPhase : atRandomPhase);

    return { seeds: PROOF_SEEDS, falls: run.falls, modelHash: modelHashes(scene.model).physics };
  } finally {
    prover.dispose();
  }
}

export function handoffStates(scene: KitScene, from: string, count = HANDOFF_STATES): SkillStates | null {
  const found = runnable(scene, [from]);

  if (!found) return null;

  try {
    const samples = found.prover.states(from, count);

    return samples.length ? { skill: from, joints: found.joints, samples } : null;
  } finally {
    found.prover.dispose();
  }
}
