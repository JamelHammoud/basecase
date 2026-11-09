import fs from 'node:fs';
import path from 'node:path';
import type { MainModule } from '@mujoco/mujoco';
import { modelHashes, type Skill } from '../../src/skills/artifacts';
import type { Method } from '../../src/skills/router';
import { forgeRunner, forgeSteps } from '../skills/forge';
import { skillStore } from '../skills/plans';
import type { AnythingModule, AnythingOutcome } from './anything';
import { StandIn } from './approver';
import { zooBody, type ZooBody } from './bodies';
import type { PoserPool, ZooPair } from './generator';
import { hiddenArenaPasses } from './judge';
import { passedArena, ZOO_BARS, type OutcomeKind, type PairResult } from './score';

export const ZOO_METHODS: readonly Method[] = Object.freeze([
  'ik-or-motion-plan',
  'tracking',
  'routine',
  'lqr-or-mpc',
  'tracking-rl-with-reset-curriculum',
  'reward-search',
]);

const GRACE_S = 120;

interface Attempt {
  outcome: AnythingOutcome | null;
  error: string | null;
  wallS: number;
  steps: number;
  standIn: StandIn;
}

export interface PairContext {
  mj: MainModule;
  pair: ZooPair;
  anything: AnythingModule;
  pool: PoserPool;
  outDir: string;
}

function capped<T>(run: () => Promise<T>, capS: number): Promise<T | 'timeout'> {
  const late = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), capS * 1000).unref());

  return Promise.race([run(), late]);
}

async function attempt(ctx: PairContext, options: { tag: string; method?: Method; wallS: number }): Promise<Attempt> {
  const { mj, pair, anything, pool } = ctx;
  const body = zooBody(pair.body);
  const dir = path.join(ctx.outDir, 'work', pair.id, options.tag);
  const forge = forgeRunner(path.join(dir, 'forge'));
  const store = skillStore(path.join(dir, 'store'));
  const standIn = new StandIn(pair.expect === 'feasible' ? pool.get(pair.body) : null, pair.rollouts);
  const started = performance.now();
  let error: string | null = null;
  const run = () =>
    anything.trainAnything({
      mj,
      prompt: pair.prompt,
      design: `zoo-${body.id}`,
      model: body.model,
      approve: (proposal) => standIn.approve(proposal),
      forge: forge.run,
      save: store.save,
      budget: { steps: ZOO_BARS.budgetSteps, wallS: options.wallS },
      signal: AbortSignal.timeout(Math.round(options.wallS * 1000)),
      ...(options.method ? { method: options.method } : {}),
    });
  const outcome = await capped(run, options.wallS + GRACE_S).catch((e: unknown) => {
    error = String((e as Error)?.message ?? e).slice(0, 300);

    return null;
  });
  const wallS = (performance.now() - started) / 1000;

  return { outcome: outcome === 'timeout' ? null : outcome, error, wallS, steps: forgeSteps(forge.records), standIn };
}

function boundTo(skill: Skill, body: ZooBody, standIn: StandIn): boolean {
  const own = skill.evidence?.passed === true && skill.evidence.binding.contract === skill.binding.contract;

  return (
    own && skill.binding.contract === standIn.approvedHash && skill.binding.physics === modelHashes(body.model).physics
  );
}

async function judged(ctx: PairContext, a: Attempt): Promise<{ bound: boolean; hiddenPass: boolean | null }> {
  if (a.outcome?.kind !== 'skill') return { bound: false, hiddenPass: null };

  const body = zooBody(ctx.pair.body);
  const { skill } = a.outcome;
  const bound = boundTo(skill, body, a.standIn);

  if (!ctx.pair.hidden) return { bound, hiddenPass: false };

  const hiddenPass = await hiddenArenaPasses(ctx.mj, body, ctx.pair.hidden, skill).catch(() => false);

  return { bound, hiddenPass };
}

const kindOf = (a: Attempt): OutcomeKind => {
  if (a.outcome) return a.outcome.kind;

  return a.error ? 'error' : 'timeout';
};

async function routerMiss(ctx: PairContext, chosen: Method, chosenWallS: number): Promise<boolean> {
  const capS = chosenWallS / ZOO_BARS.routerFactor;

  for (const method of ZOO_METHODS.filter((m) => m !== chosen)) {
    const alt = await attempt(ctx, { tag: `alt-${method}`, method, wallS: capS });
    const verdict = await judged(ctx, alt);

    if (alt.wallS < capS && verdict.bound && verdict.hiddenPass) return true;
  }

  return false;
}

export async function runPair(ctx: PairContext): Promise<PairResult> {
  const main = await attempt(ctx, { tag: 'main', wallS: ZOO_BARS.budgetWallS });
  const verdict = await judged(ctx, main);
  const method = main.outcome?.kind === 'skill' ? main.outcome.method : null;
  const result: PairResult = {
    id: ctx.pair.id,
    expect: ctx.pair.expect,
    outcome: kindOf(main),
    claimed: main.outcome?.kind === 'skill',
    ...verdict,
    withinBudget: main.wallS <= ZOO_BARS.budgetWallS && main.steps <= ZOO_BARS.budgetSteps,
    wallS: main.wallS,
    steps: main.steps,
    method,
    routerMiss: null,
  };

  if (passedArena(result) && method) result.routerMiss = await routerMiss(ctx, method as Method, main.wallS);

  return result;
}

export function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

export function secretsOf(seed: string, pairs: ZooPair[]): string[] {
  const hidden = pairs.flatMap((p) => (p.hidden ? [p.hidden] : []));

  return [
    seed,
    ...hidden.map((h) => JSON.stringify(h.contract)),
    ...hidden.map((h) => JSON.stringify(h.contract.success)),
  ];
}
