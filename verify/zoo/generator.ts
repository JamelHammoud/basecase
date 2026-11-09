import type { MainModule } from '@mujoco/mujoco';
import type { Contract } from '../../src/skills/contract';
import type { SignalSource } from '../../src/skills/environment';
import { Poser, ZOO_BODY_IDS, zooBody, type ZooBody } from './bodies';
import { labelled, limpPasses, variantsOf, type Labelled } from './rollouts';
import { pick, seededRng, shuffled, type Rng } from './rng';
import { ZOO_TASKS, zooTask } from './tasks';
import type { Family, TaskDraw, ZooTask } from './taskTypes';

export type Expectation = 'feasible' | 'infeasible' | 'deformable';

export interface Hidden {
  contract: Contract;
  signals: Record<string, SignalSource>;
  horizonS: number;
  startOffsetDeg: number;
}

export interface ZooPair {
  id: string;
  task: string;
  body: string;
  family: Family;
  expect: Expectation;
  prompt: string;
  hidden: Hidden | null;
  rollouts: Labelled[];
}

export interface PairRef {
  task: string;
  body: string;
  family: Family;
  expect: Expectation;
}

const ATTEMPTS = 12;
const MIN_EACH_LABEL = 2;

export function expectationOf(task: ZooTask, body: Pick<ZooBody, 'cls'>): Expectation {
  if (task.family === 'soft') return 'deformable';

  return task.classes.includes(body.cls) ? 'feasible' : 'infeasible';
}

export function zooGrid(): PairRef[] {
  return ZOO_BODY_IDS.flatMap((bodyId) => {
    const body = zooBody(bodyId);

    return ZOO_TASKS.map((t) => ({ task: t.id, body: bodyId, family: t.family, expect: expectationOf(t, body) }));
  });
}

export const pairId = (ref: Pick<PairRef, 'task' | 'body'>) => `${ref.task}@${ref.body}`;

export interface Validity {
  ok: boolean;
  why: string;
}

export async function validity(mj: MainModule, poser: Poser, draw: TaskDraw, rollouts: Labelled[]): Promise<Validity> {
  const verdict = (name: string) => rollouts.find((r) => r.name === name)?.pass;
  const passes = rollouts.filter((r) => r.pass).length;

  if (verdict('intent') !== true) return { ok: false, why: 'the intended motion fails its own judge' };

  if (!draw.restIsGoal && verdict('rest') !== false) return { ok: false, why: 'standing still passes' };

  if (passes < MIN_EACH_LABEL || rollouts.length - passes < MIN_EACH_LABEL)
    return { ok: false, why: `labels are lopsided: ${passes} of ${rollouts.length} pass` };

  if (await limpPasses(mj, poser, draw)) return { ok: false, why: 'a limp robot passes' };

  return { ok: true, why: '' };
}

async function feasiblePair(
  mj: MainModule,
  ref: PairRef,
  rng: Rng,
  pool: PoserPool,
): Promise<Pick<ZooPair, 'prompt' | 'hidden' | 'rollouts'>> {
  const poser = pool.get(ref.body);
  const { body } = poser;
  const task = zooTask(ref.task);
  const heightM = poser.rootAt()[2];
  const reasons: string[] = [];

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const draw = task.draw!({ rng, body, poser, heightM });
    const rollouts = await labelled(poser, draw, variantsOf(draw, rng, heightM));
    const valid = await validity(mj, poser, draw, rollouts);

    if (valid.ok) {
      const hidden = {
        contract: draw.contract,
        signals: draw.signals,
        horizonS: draw.horizonS,
        startOffsetDeg: draw.startOffsetDeg ?? 0,
      };

      return { prompt: draw.prompt, hidden, rollouts };
    }

    reasons.push(valid.why);
  }

  throw new Error(`Generator: ${pairId(ref)} found no valid draw (${[...new Set(reasons)].join('; ')})`);
}

export class PoserPool {
  private readonly posers = new Map<string, Poser>();
  private readonly mj: MainModule;

  constructor(mj: MainModule) {
    this.mj = mj;
  }

  get(bodyId: string): Poser {
    const known = this.posers.get(bodyId);

    if (known) return known;

    const made = new Poser(this.mj, zooBody(bodyId));

    this.posers.set(bodyId, made);

    return made;
  }

  dispose() {
    for (const p of this.posers.values()) p.dispose();

    this.posers.clear();
  }
}

export async function generatePair(mj: MainModule, seed: string, ref: PairRef, pool?: PoserPool): Promise<ZooPair> {
  const rng = seededRng(seed, ref.task, ref.body);
  const base = { id: pairId(ref), ...ref };

  if (ref.expect !== 'feasible') return { ...base, prompt: zooTask(ref.task).say(rng), hidden: null, rollouts: [] };

  const own = pool ?? new PoserPool(mj);

  try {
    return { ...base, ...(await feasiblePair(mj, ref, rng, own)) };
  } finally {
    if (!pool) own.dispose();
  }
}

export const SAMPLE_FEASIBLE: Readonly<Record<string, number>> = Object.freeze({
  'arm-3dof': 2,
  'arm-6dof': 2,
  'rover-diff': 2,
  'quad-servo': 3,
  hexapod: 2,
  'biped-servo': 3,
});
export const SAMPLE_INFEASIBLE = 4;
export const SAMPLE_DEFORMABLE = 2;
export const SAMPLE_SIZE = 20;

function feasibleFor(rng: Rng, grid: PairRef[], body: string, count: number): PairRef[] {
  const mine = grid.filter((p) => p.body === body && p.expect === 'feasible');
  const families = shuffled(rng, [...new Set(mine.map((p) => p.family))]);
  const out: PairRef[] = [];

  for (let i = 0; i < count; i++) {
    const family = families[i % families.length];
    const left = mine.filter((p) => p.family === family && !out.includes(p));

    out.push(pick(rng, left.length ? left : mine.filter((p) => !out.includes(p))));
  }

  return out;
}

function spread(rng: Rng, pool: PairRef[], count: number): PairRef[] {
  const out: PairRef[] = [];

  for (const p of shuffled(rng, pool)) {
    if (out.length < count && !out.some((o) => o.body === p.body || o.task === p.task)) out.push(p);
  }

  return out;
}

export function stratifiedSample(seed: string, grid: PairRef[] = zooGrid()): PairRef[] {
  const rng = seededRng(seed, 'sample');
  const feasible = Object.entries(SAMPLE_FEASIBLE).flatMap(([body, n]) => feasibleFor(rng, grid, body, n));
  const infeasible = spread(
    rng,
    grid.filter((p) => p.expect === 'infeasible'),
    SAMPLE_INFEASIBLE,
  );
  const deformable = spread(
    rng,
    grid.filter((p) => p.expect === 'deformable'),
    SAMPLE_DEFORMABLE,
  );

  return [...feasible, ...infeasible, ...deformable];
}
