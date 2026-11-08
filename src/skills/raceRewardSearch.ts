import type { ArenaEvidence } from './artifacts';
import type { RewardRef } from './environment';
import { lastError, runCounted, type ForgeTally } from './forgeRunner';
import { sha256Hex } from './hash';
import { kitJob } from './kitJob';
import { kitRobot } from './kitModel';
import { kitReward } from './kitRewards';
import { proveSkill } from './prove';
import { robustnessReward } from './raceRobustness';
import { elapsedOf, type RaceCandidate, type RaceClock, type RaceInput, type SolveResult } from './raceTypes';
import { REWARD_SEARCH_STAGES } from './router';

const ENVS = 64;
const HORIZON = 24;
const SLOWEST_STEPS_PER_S = 4000;

interface Entrant {
  source: string;
  reward: RewardRef;
  score: number;
}

function entrants(input: RaceInput): Entrant[] {
  const agent = input.rewardCandidates ?? [kitReward(input.task.model, 'velocity-tracking')];
  const own = agent.map((source) => ({
    source,
    reward: { kind: 'rewardlang', hash: sha256Hex(source) } as RewardRef,
    score: 0,
  }));
  const robust = input.robustnessCandidate === false ? null : robustnessReward(input.task.environment);

  return robust ? [...own, { source: robust, reward: { kind: 'contract-robustness' }, score: 0 }] : own;
}

function refusal(input: RaceInput): string | null {
  const { goal, model } = input.task;

  if (goal.kind !== 'velocity') return 'Reward search here trains robots that move around, and this goal is a reach.';

  return model.robots[0]?.floating ? null : 'Forge trains robots with a floating base, and this one is fixed.';
}

const scoreOf = (evidence: ArenaEvidence) =>
  evidence.lowerBound + evidence.variants.reduce((s, v) => s + v.passes, 0) / 1000;

interface Run {
  input: RaceInput;
  clock: RaceClock;
  candidates: RaceCandidate[];
  budget: number;
}

function jobFor(input: RaceInput, options: { source: string; steps: number; seed: number }) {
  const { task } = input;
  const command = task.goal.kind === 'velocity' ? task.goal.command : ([0, 0, 0] as const);
  const iterations = Math.max(1, Math.ceil(options.steps / (ENVS * HORIZON)));
  const minutes = Math.ceil(options.steps / SLOWEST_STEPS_PER_S / 60);
  const base = kitJob(task.model, 'velocity-tracking', {
    minutes,
    seed: options.seed,
    reward: options.source,
    maxIterations: iterations,
  });

  return { ...base, name: `Race: ${task.id}`, command, commands: undefined, envs: ENVS };
}

async function trainOne(run: Run, options: { entrant: Entrant; steps: number; seed: number }) {
  const { input, clock, candidates } = run;
  const { task } = input;
  const job = jobFor(input, { source: options.entrant.source, steps: options.steps, seed: options.seed });
  const tally: ForgeTally = { steps: 0, forgeRuns: 0 };
  const outcome = await runCounted(input.forge, { name: job.name, xml: task.model.xml, job }, tally);
  const candidate: RaceCandidate = { reward: options.entrant.reward, steps: tally.steps, arenaPassed: null };

  clock.steps += tally.steps;
  candidates.push(candidate);

  if (!outcome.ok || !outcome.policy) return { skill: null, why: lastError(outcome) };

  const proof = await proveSkill({
    mj: input.mj,
    model: task.model,
    design: task.design,
    name: task.id,
    environment: task.environment,
    controller: { kind: 'policy', policy: outcome.policy, robot: kitRobot(task.model).key },
    save: input.save,
    origin: () => ({ method: 'reward-search', cost: elapsedOf(clock) }),
  });

  candidate.arenaPassed = proof.evidence.passed;
  options.entrant.score = scoreOf(proof.evidence);

  return { skill: proof.skill, why: proof.evidence.summary };
}

async function runStages(run: Run, field: Entrant[]) {
  let pool = field;
  let seed = 1;
  let why = 'No candidate passed Arena.';

  for (const stage of REWARD_SEARCH_STAGES) {
    for (const entrant of pool.slice(0, stage.candidates)) {
      const left = run.budget - run.clock.steps;

      if (left <= 0 || run.input.signal?.aborted) return { skill: null, why: 'The step budget ran out.' };

      const result = await trainOne(run, { entrant, steps: Math.min(stage.steps, left), seed: seed++ });

      if (result.skill) return result;

      why = result.why;
    }

    pool = [...pool].sort((a, b) => b.score - a.score);
  }

  return { skill: null, why };
}

export async function rewardSearch(input: RaceInput, clock: RaceClock): Promise<SolveResult> {
  const candidates: RaceCandidate[] = [];
  const startSteps = clock.steps;
  const refused = refusal(input);
  const attempt = (passed: boolean, reason: string) => ({
    method: 'reward-search' as const,
    passed,
    cost: { ...elapsedOf(clock), steps: clock.steps - startSteps },
    reason,
    candidates,
  });

  if (refused) return { skill: null, attempt: attempt(false, refused) };

  const run: Run = { input, clock, candidates, budget: startSteps + (input.budgetSteps ?? Infinity) };
  const result = await runStages(run, entrants(input));

  return { skill: result.skill, attempt: attempt(!!result.skill, result.why) };
}
