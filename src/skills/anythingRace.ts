import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { runArena } from './arena';
import type { ArenaEvidence, Skill, SkillController } from './artifacts';
import type { Environment } from './environment';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import { proveSkill } from './prove';
import { solveWith } from './race';
import type { RaceCost } from './raceTypes';
import { routeTask, type Method, type Route, type TaskAnalysis } from './router';
import type { BodyFacts } from './anythingBody';
import { planMotion } from './anythingMotion';
import type { Poser } from './anythingPoser';
import { planRoute, roverVariants, wheelSetups } from './anythingRoute';
import { lowerSpec } from './anythingSignals';
import { claimSpec } from './anythingTighten';
import type { TaskSpec } from './anythingTypes';
import { planWalk } from './anythingWalk';

export const LADDER: readonly Method[] = Object.freeze([
  'ik-or-motion-plan',
  'tracking',
  'routine',
  'lqr-or-mpc',
  'tracking-rl-with-reset-curriculum',
  'reward-search',
]);

const SURE_PASSES = 31;
const OVERTIME_S = 1.5;
const SEARCH_MINUTES = 20;

export interface Task {
  mj: MainModule;
  model: SimModel;
  design: string;
  facts: BodyFacts;
  poser: Poser;
  spec: TaskSpec;
  environment: Environment;
  forge: ForgeRunner;
  save: SkillSave;
  budgetSteps: number;
  signal: AbortSignal;
  secondsLeft: () => number;
  steps: () => number;
}

export interface Attempt {
  method: Method;
  skill: Skill | null;
  reason: string;
}

export function travels(spec: TaskSpec): boolean {
  return spec.intent.some((k) => Math.abs(k.base?.forward ?? 0) > 0.01 || Math.abs(k.base?.left ?? 0) > 0.01);
}

export function analysisOf(facts: BodyFacts, spec: TaskSpec): TaskAnalysis {
  const legsTravel = facts.cls === 'legs' && travels(spec);
  const joints = facts.joints.filter((j) => j.actuated).length;

  return {
    simCanCheck: true,
    quasiStatic: !legsTravel,
    motionShapeMatters: false,
    kitSkills: null,
    stateDimension: 2 * joints + (facts.floating ? 12 : 0),
    contactRich: facts.floating,
    trajectoryOptimisation: 'not-tried',
    rewardSearchRounds: 0,
    demo: 'not-asked',
  };
}

export const routeOf = (facts: BodyFacts, spec: TaskSpec): Route => routeTask(analysisOf(facts, spec));

type Plan = { controller: SkillController | null; reason: string };

function motionPlan(task: Task): Promise<Plan> {
  const { mj, model, facts, spec, environment } = task;
  const stop = () => task.signal.aborted;

  if (facts.cls === 'wheels') {
    const drive = { kind: 'rover' as const, wheels: wheelSetups(mj, model, facts) };

    return planRoute({ mj, model, facts, spec, environment, drive, variants: roverVariants(), stop });
  }

  if (facts.cls === 'legs' && travels(spec))
    return Promise.resolve({ controller: null, reason: 'Traveling on legs needs a learned gait, not a pose plan.' });

  return planMotion({ mj, model, poser: task.poser, spec, environment, stop });
}

async function rewardSearchPlan(task: Task): Promise<Plan> {
  const { facts, spec } = task;

  if (facts.cls === 'legs' && travels(spec)) return planWalk({ ...task });

  if (facts.cls !== 'legs')
    return { controller: null, reason: 'Forge learns policies for legged robots; this robot has none to learn.' };

  if (task.secondsLeft() < SEARCH_MINUTES * 60)
    return { controller: null, reason: 'Too little time is left to search rewards.' };

  const outcome = await solveWith({
    mj: task.mj,
    task: {
      id: spec.name,
      design: task.design,
      model: task.model,
      environment: task.environment,
      analysis: analysisOf(facts, spec),
      goal: { kind: 'open' },
    },
    forge: task.forge,
    save: task.save,
    budgetSteps: Math.max(0, task.budgetSteps - task.steps()),
    signal: task.signal,
    method: 'reward-search',
  });

  return outcome.kind === 'skill'
    ? { controller: outcome.skill.controller, reason: 'Found by reward search.' }
    : { controller: null, reason: outcome.reason };
}

const sure = (evidence: ArenaEvidence) => evidence.passed && evidence.variants.every((v) => v.passes >= SURE_PASSES);

async function confident(task: Task, controller: SkillController): Promise<boolean> {
  const level = task.facts.cls === 'legs' && !travels(task.spec);
  const strict = lowerSpec(claimSpec(task.spec, { level }), task.facts);
  const contract = strict.contract;
  const environment = {
    ...task.environment,
    horizonS: task.environment.horizonS + OVERTIME_S,
    contract,
    signals: { ...task.environment.signals, ...strict.signals },
  };
  const evidence = await runArena({ mj: task.mj, model: task.model, contract, controller, environment });

  return evidence.passed;
}

async function proven(task: Task, options: { method: Method; controller: SkillController; cost: () => RaceCost }) {
  const { method, controller } = options;
  const proof = await proveSkill({
    mj: task.mj,
    model: task.model,
    design: task.design,
    name: task.spec.name,
    environment: task.environment,
    controller,
    save: task.save,
    origin: () => ({ method, cost: options.cost() }),
  });

  if (!proof.skill) return { method, skill: null, reason: `Arena: ${proof.evidence.summary}` };

  if (!sure(proof.evidence) || !(await confident(task, controller)))
    return { method, skill: null, reason: `Arena passed too narrowly to trust: ${proof.evidence.summary}` };

  return { method, skill: proof.skill, reason: proof.evidence.summary };
}

export async function solveMethod(task: Task, options: { method: Method; cost: () => RaceCost }): Promise<Attempt> {
  const { method } = options;

  if (method !== 'ik-or-motion-plan' && method !== 'reward-search')
    return { method, skill: null, reason: 'This solver isn’t built.' };

  const plan = method === 'ik-or-motion-plan' ? await motionPlan(task) : await rewardSearchPlan(task);

  if (!plan.controller || task.signal.aborted) return { method, skill: null, reason: plan.reason };

  return proven(task, { method, controller: plan.controller, cost: options.cost });
}

export async function race(task: Task, options: { route: Route; cost: () => RaceCost }): Promise<Attempt[]> {
  const from = LADDER.indexOf(options.route.method);
  const attempts: Attempt[] = [];

  for (const method of from < 0 ? [] : LADDER.slice(from)) {
    if (task.signal.aborted) break;

    const attempt = await solveMethod(task, { method, cost: options.cost });

    attempts.push(attempt);

    if (attempt.skill) break;
  }

  return attempts;
}
