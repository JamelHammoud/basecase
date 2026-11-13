import { proveSkill } from './prove';
import { planReach } from './raceIk';
import { rewardSearch } from './raceRewardSearch';
import { playMove, trackMotion } from './raceTracking';
import {
  elapsedOf,
  type RaceAttempt,
  type RaceClock,
  type RaceInput,
  type RaceOutcome,
  type SolveResult,
} from './raceTypes';
import { routeTask, type Method } from './router';

export type { RaceAttempt, RaceCandidate, RaceCost, RaceGoal, RaceInput, RaceOutcome, RaceTask } from './raceTypes';

const LADDER: readonly Method[] = Object.freeze([
  'ik-or-motion-plan',
  'tracking',
  'routine',
  'lqr-or-mpc',
  'tracking-rl-with-reset-curriculum',
  'reward-search',
]);

const unbuilt = (method: Method, clock: RaceClock): SolveResult => ({
  skill: null,
  attempt: { method, passed: false, cost: elapsedOf(clock), reason: 'This solver isn’t built.', candidates: [] },
});

async function ikPlan(input: RaceInput, clock: RaceClock): Promise<SolveResult> {
  const { mj, task } = input;
  const fail = (reason: string): SolveResult => ({
    skill: null,
    attempt: { method: 'ik-or-motion-plan', passed: false, cost: elapsedOf(clock), reason, candidates: [] },
  });

  if (task.goal.kind === 'track') return playMove(input, clock);

  if (task.goal.kind === 'velocity')
    return fail('IK plans poses for reach goals, and this task moves the whole robot.');

  if (task.goal.kind === 'open') return fail('IK plans poses for reach goals, and this task has no point to reach.');

  const plan = planReach(mj, task.model, { ...task.goal, horizonS: task.environment.horizonS });
  const proof = await proveSkill({
    mj,
    model: task.model,
    design: task.design,
    name: task.id,
    environment: task.environment,
    controller: plan.controller,
    save: input.save,
    origin: () => ({ method: 'ik-or-motion-plan', cost: elapsedOf(clock) }),
  });
  const reason = `${proof.evidence.summary} Planned within ${(plan.missM * 1000).toFixed(1)} mm.`;

  return {
    skill: proof.skill,
    attempt: { method: 'ik-or-motion-plan', passed: !!proof.skill, cost: elapsedOf(clock), reason, candidates: [] },
  };
}

function solve(input: RaceInput, method: Method, clock: RaceClock): Promise<SolveResult> {
  if (method === 'ik-or-motion-plan') return ikPlan(input, clock);

  if (method === 'tracking') return trackMotion(input, clock);

  if (method === 'reward-search') return rewardSearch(input, clock);

  return Promise.resolve(unbuilt(method, clock));
}

function finish(options: { clock: RaceClock; attempts: RaceAttempt[]; found: SolveResult | null; input: RaceInput }) {
  const { clock, attempts, found, input } = options;
  const route = routeTask(input.task.analysis);
  const cost = elapsedOf(clock);

  if (found?.skill)
    return { kind: 'skill', skill: found.skill, method: found.attempt.method, route, cost, attempts } as const;

  const reason = attempts.at(-1)?.reason ?? route.reason;

  return { kind: 'not-found', route, cost, attempts, reason } as const;
}

export async function solveWith(input: RaceInput & { method: Method }): Promise<RaceOutcome> {
  const clock: RaceClock = { started: performance.now(), steps: 0 };

  if (input.signal?.aborted) return finish({ clock, attempts: [], found: null, input });

  const found = await solve(input, input.method, clock);

  return finish({ clock, attempts: [found.attempt], found, input });
}

export async function runSolverRace(input: RaceInput): Promise<RaceOutcome> {
  const clock: RaceClock = { started: performance.now(), steps: 0 };
  const route = routeTask(input.task.analysis);
  const from = LADDER.indexOf(route.method);
  const methods = from < 0 ? [] : LADDER.slice(from);
  const attempts: RaceAttempt[] = [];

  for (const method of methods) {
    if (input.signal?.aborted) break;

    const found = await solve(input, method, clock);

    attempts.push(found.attempt);

    if (found.skill) return finish({ clock, attempts, found, input });
  }

  return finish({ clock, attempts, found: null, input });
}
