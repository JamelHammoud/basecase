import type { PolicySpec } from '../sim/policy';
import type { Skill } from './artifacts';
import { runCounted, runFolder, type ForgeTally } from './forgeRunner';
import { kitRobot } from './kitModel';
import { arenaPasses } from './kitAcceptance';
import type { KitStage, KitTry } from './kitSchedule';
import { firstPassingTry, type Judgement } from './kitTries';
import { moveProblems } from './moveEnvironment';
import { moveJob } from './moveJob';
import { moveSchedule } from './moveSchedule';
import { proveSkill } from './prove';
import { elapsedOf, type RaceClock, type RaceInput, type SolveResult } from './raceTypes';

const SEED_SPAN = 1_000_000;

const freshSeed = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % SEED_SPAN);

function failed(clock: RaceClock, method: 'tracking' | 'ik-or-motion-plan', reason: string): SolveResult {
  return { skill: null, attempt: { method, passed: false, cost: elapsedOf(clock), reason, candidates: [] } };
}

export async function playMove(input: RaceInput, clock: RaceClock): Promise<SolveResult> {
  const { mj, task } = input;

  if (task.goal.kind !== 'track') return failed(clock, 'ik-or-motion-plan', 'This task has no animation to play.');

  const proof = await proveSkill({
    mj,
    model: task.model,
    design: task.design,
    name: task.id,
    environment: task.environment,
    controller: { kind: 'animation', animation: task.goal.animation },
    save: input.save,
    origin: () => ({ method: 'ik-or-motion-plan', cost: elapsedOf(clock) }),
  });
  const attempt = { method: 'ik-or-motion-plan' as const, passed: !!proof.skill, reason: proof.evidence.summary };

  return { skill: proof.skill, attempt: { ...attempt, cost: elapsedOf(clock), candidates: [] } };
}

interface Tracking {
  input: RaceInput;
  clock: RaceClock;
  tally: ForgeTally;
}

async function trainStage(run: Tracking, stage: KitStage, from: { seed: number; folder: string | null }) {
  const { input, clock, tally } = run;
  const { task } = input;
  const job = moveJob(task.model, task.environment, {
    name: task.id,
    minutes: stage.minutes,
    seed: from.seed,
    delaySteps: stage.delaySteps,
    delayRamp: stage.delayRamp,
    warmStart: from.folder,
  });
  const outcome = await runCounted(input.forge, { name: job.name, xml: task.model.xml, job }, tally);

  clock.steps = tally.steps;

  return { policy: outcome.ok ? outcome.policy : null, folder: runFolder(outcome) };
}

async function judge(run: Tracking, policy: PolicySpec): Promise<Judgement<Skill>> {
  const { input, clock } = run;
  const { task } = input;
  const proof = await proveSkill({
    mj: input.mj,
    model: task.model,
    design: task.design,
    name: task.id,
    environment: task.environment,
    controller: { kind: 'policy', policy, robot: kitRobot(task.model).key },
    save: input.save,
    origin: () => ({ method: 'tracking', cost: elapsedOf(clock) }),
  });

  return { skill: proof.skill, score: arenaPasses([proof.evidence]) };
}

export async function trackMotion(input: RaceInput, clock: RaceClock, tries?: readonly KitTry[]): Promise<SolveResult> {
  const { task } = input;
  const reference = task.environment.reference;

  if (task.goal.kind !== 'track' || !reference)
    return failed(clock, 'tracking', 'Tracking follows a Pose-tab animation, and this task has none.');

  if (!task.model.robots[0]?.floating) return failed(clock, 'tracking', 'A robot fixed in place plays the animation.');

  const problems = moveProblems(task.model, reference);

  if (problems.length) return failed(clock, 'tracking', problems.join(' '));

  const run: Tracking = { input, clock, tally: { steps: clock.steps, forgeRuns: 0 } };
  const skill = await firstPassingTry({
    tries: tries ?? moveSchedule(task.model),
    firstSeed: freshSeed(),
    train: (stage, from) => trainStage(run, stage, from),
    validate: () => Promise.resolve(0),
    judge: (policy: PolicySpec) => judge(run, policy),
    aborted: () => !!input.signal?.aborted,
  });
  const reason = skill ? 'Arena passed the trained move.' : 'No policy passed Arena within the training budget.';

  return { skill, attempt: { method: 'tracking', passed: !!skill, cost: elapsedOf(clock), reason, candidates: [] } };
}
