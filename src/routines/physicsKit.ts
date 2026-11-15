import type { MainModule } from '@mujoco/mujoco';
import type { Skill } from '../skills/artifacts';
import type { SkillStates } from '../skills/environment';
import type { DriveSetup } from '../sim/drive';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { LOOK_DEG, routineBody, type RoutineBody } from './physicsBody';
import { atRandomPhase, PROOF_SEEDS, Prover } from './physicsProver';
import { isKitPair, KIT_PAIRS as PAIRS, proveKitPair } from './kitPairProof';
import type { Resource, SkillContract, TransitionProof } from './schema';
import { controllerStamp, pairStamp, physicsStamp, type StampScene } from './skillStamps';
import { hashOf } from '../skills/hash';
import type { KitTransitionProof } from './kitBehavior';

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

const LOOK_TOLERANCE_DEG = 6;
const D2R = Math.PI / 180;
const BODY_SKILLS = ['walk', 'settle', 'turn-away'] as const;
const HANDOFF_STATES = 32;

interface KitProof {
  pairs: Map<string, ReturnType<typeof proveKitPair>>;
  failed: Set<string>;
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

interface KitFacts {
  body: RoutineBody | null;
  proof: KitProof | null;
  modelHash: string;
  stamped: StampScene;
}

function kitContracts({ body, proof, modelHash, stamped }: KitFacts): Omit<RoutineKit, 'policies' | 'drive'> {
  const problems: Record<string, string> = {};
  const skills = [...BODY_SKILLS, 'look-at'].map((id) => {
    const reason = body ? reasonFor(body, id, proof) : 'Only a robot that walks on legs runs the Motor Kit.';
    const proofs: Record<string, TransitionProof> = Object.fromEntries(
      PAIRS.filter(([from, to]) => from === id && !reason && proof?.pairs.has(`${from}->${to}`)).map(([, to]) => [
        to,
        {
          seeds: PROOF_SEEDS,
          ...proof!.pairs.get(`${id}->${to}`)!,
          modelHash,
          skills: pairStamp(stamped, { from: id, to }),
        },
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
  const proof: KitProof = { pairs: new Map(), failed: new Set() };

  try {
    for (const [from, to] of PAIRS) {
      proof.pairs.set(`${from}->${to}`, proveKitPair(prover, { from, to }));
    }

    if (lookFailed(prover)) proof.failed.add('look-at');
  } finally {
    prover.dispose();
  }

  return proof;
}

const cache = new Map<string, RoutineKit>();

const libraryKey = (skills: readonly Skill[]) =>
  skills.map((s) => `${s.name}:${controllerStamp(s.controller)}`).join('|');

export function kitForModel(options: KitScene): RoutineKit {
  const { mj, model, joints, skills } = options;
  const drive = options.drive ?? null;
  const modelHash = physicsStamp(model);
  const key = `${modelHash}#${libraryKey(skills)}#${hashOf(drive)}`;
  const known = cache.get(key);

  if (known) return known;

  const body = routineBody(model, joints, { skills, drive });
  const proof = body && proveKit(mj, body);
  const kit = { ...kitContracts({ body, proof, modelHash, stamped: { skills, drive } }), policies: [...skills], drive };

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

export function proveHandoff(scene: KitScene, pair: { from: string; to: string }): KitTransitionProof | null {
  const { prover } = runnable(scene, [pair.from, pair.to]) ?? {};

  if (!prover) return null;

  try {
    const run = isKitPair(pair) ? proveKitPair(prover, pair) : prover.run(pair.from, pair.to, atRandomPhase);

    return {
      seeds: PROOF_SEEDS,
      falls: run.falls,
      ...(isKitPair(pair) ? (run as ReturnType<typeof proveKitPair>) : {}),
      modelHash: physicsStamp(scene.model),
      skills: pairStamp(scene, pair),
    };
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
