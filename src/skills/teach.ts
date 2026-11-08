import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { Skill } from './artifacts';
import { contractWords } from './contractWords';
import { validateEnvironment, type Environment } from './environment';
import { checkFeasibility } from './feasibility';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import { hashOf } from './hash';
import { kitRobot } from './kitModel';
import { proveSkill } from './prove';
import { runSolverRace, type RaceGoal, type RaceOutcome } from './race';
import { planReach } from './raceIk';
import { judgeRollout, type Rollout } from './rollout';
import { routeTask, type Route, type TaskAnalysis } from './router';
import { draftAnalysis, draftEnvironment, draftGoal, draftProblems, type DraftInput } from './teachEnvironment';

export type { DraftInput } from './teachEnvironment';

export interface SkillDraft {
  id: string;
  name: string;
  request: string;
  design: string;
  goal: RaceGoal;
  environment: Environment;
  analysis: TaskAnalysis;
  rewards: string[] | null;
}

export interface DraftReport {
  draft: SkillDraft;
  words: string[];
  route: Route;
  rollouts: Rollout[];
  warnings: string[];
  relaxation: string | null;
}

export type DraftResult = { ok: true; report: DraftReport } | { ok: false; problems: string[] };

interface Sim {
  mj: MainModule;
  model: SimModel;
}

async function rolloutsFor(sim: Sim, draft: SkillDraft): Promise<Rollout[]> {
  const { mj, model } = sim;
  const environment = draft.environment;
  const still = await judgeRollout({ mj, model, environment, controller: { kind: 'hold' }, label: 'Holding still' });

  if (draft.goal.kind !== 'reach') return [still];

  const plan = planReach(mj, model, { ...draft.goal, horizonS: environment.horizonS });
  const planned = await judgeRollout({ mj, model, environment, controller: plan.controller, label: 'Planned reach' });

  return [still, planned];
}

function standReport(sim: Sim) {
  const robot = kitRobot(sim.model);

  if (!robot.floating) return null;

  return checkFeasibility(sim.mj, sim.model, { robot: robot.key, stand: true });
}

export async function draftSkill(input: Sim & { design: string; request: DraftInput }): Promise<DraftResult> {
  const { model, design, request } = input;
  const shape = draftProblems(request, model);

  if (shape.length) return { ok: false, problems: shape };

  const environment = draftEnvironment(model, request);
  const problems = await validateEnvironment(environment, model);

  if (problems.length) return { ok: false, problems };

  const goal = draftGoal(request.goal);
  const analysis = draftAnalysis(model, request);
  const body = { name: request.name.trim(), request: request.request, design, goal, environment, analysis };
  const draft: SkillDraft = { id: hashOf(body), ...body, rewards: request.rewards?.length ? request.rewards : null };
  const rollouts = await rolloutsFor(input, draft);
  const stand = standReport(input);
  const warnings = [
    ...(rollouts[0].passed
      ? ['Holding still already passes, so this contract can’t tell the skill from doing nothing.']
      : []),
    ...(stand && !stand.feasible ? [stand.summary] : []),
  ];

  return {
    ok: true,
    report: {
      draft,
      words: contractWords(environment.contract),
      route: routeTask(analysis),
      rollouts,
      warnings,
      relaxation: stand?.relaxation?.message ?? null,
    },
  };
}

export function raceDraft(
  input: Sim & { draft: SkillDraft; forge: ForgeRunner; save: SkillSave; signal?: AbortSignal; budgetSteps?: number },
): Promise<RaceOutcome> {
  const { mj, model, draft } = input;

  return runSolverRace({
    mj,
    task: {
      id: draft.name,
      design: draft.design,
      model,
      environment: draft.environment,
      analysis: draft.analysis,
      goal: draft.goal,
    },
    forge: input.forge,
    save: input.save,
    rewardCandidates: draft.rewards ?? undefined,
    budgetSteps: input.budgetSteps,
    signal: input.signal,
  });
}

export async function recheckSkill(
  input: Sim & { design: string; skill: Skill; environment: Environment; save: SkillSave },
): Promise<Skill | null> {
  const { skill } = input;
  const proof = await proveSkill({
    ...input,
    name: skill.name,
    controller: skill.controller,
    origin: skill.origin ? () => skill.origin! : undefined,
  });

  return proof.skill;
}

export function raceSummary(outcome: RaceOutcome): string[] {
  const tried = outcome.attempts.map((a) => `${a.method}: ${a.reason}`);

  if (outcome.kind === 'skill')
    return [
      `Found with ${outcome.method} in ${Math.round(outcome.cost.wallS)} s.`,
      outcome.skill.evidence?.summary ?? '',
    ];

  return [`Not found. ${outcome.route.reason}`, ...tried];
}
