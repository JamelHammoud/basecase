import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { Ask } from './anythingClaude';
import { contractHash, skillHash, type ArenaEvidence, type Skill, type SkillController } from './artifacts';
import { coachPrompt, COACH_SYSTEM, readRevision, type CoachBrief, type CoachRevision } from './coachPrompt';
import { measureCoachSignals, movedEnough, signalNumber, type CoachSignals } from './coachSignals';
import type { Environment } from './environment';
import { lastError, runCounted, type ForgeRunner, type ForgeTally, type SkillSave } from './forgeRunner';
import { sha256Hex } from './hash';
import { kitJob } from './kitJob';
import type { TrainedEntry } from './kitEnvironment';
import { kitSchedule } from './kitSchedule';
import { proveSkill, type ProveInput, type Proof } from './prove';

export type { CoachBrief, CoachRevision } from './coachPrompt';

export interface CoachJudge {
  measure: (controller: SkillController, environment: Environment) => Promise<CoachSignals>;
  prove: (input: ProveInput) => Promise<Proof>;
}

export const arenaJudge = (mj: MainModule, model: SimModel): CoachJudge => ({
  measure: (controller, environment) => measureCoachSignals({ mj, model, environment, controller }),
  prove: proveSkill,
});

export interface CoachSubject {
  mj: MainModule;
  model: SimModel;
  skill: Skill;
  environment: Environment;
  reward: string;
  judge?: CoachJudge;
}

export interface CoachTraining extends CoachSubject {
  design: string;
  entry: TrainedEntry;
  brief: CoachBrief;
  revision: CoachRevision;
  forge: ForgeRunner;
  save: SkillSave;
  seed?: number;
}

export interface CoachInput extends Omit<CoachTraining, 'brief' | 'revision'> {
  words: string;
  ask: Ask;
  signal?: AbortSignal;
}

export interface CoachChange extends CoachRevision {
  before: number;
  after: number | null;
}

export type CoachOutcome =
  | { kind: 'kept'; skill: Skill; change: CoachChange & { after: number }; evidence: ArenaEvidence }
  | { kind: 'dropped'; reason: string; change: CoachChange; evidence: ArenaEvidence | null }
  | { kind: 'refused'; reason: string };

const LOG_STD_MIN = -2.5;

const judgeOf = (subject: CoachSubject) => subject.judge ?? arenaJudge(subject.mj, subject.model);

export async function coachBrief(subject: CoachSubject): Promise<CoachBrief> {
  const { skill, environment, reward } = subject;
  const signals = await judgeOf(subject).measure(skill.controller, environment);

  return { name: skill.name, skill: skillHash(skill), reward, signals };
}

export const coachedEnvironment = (environment: Environment, reward: string): Environment => ({
  ...environment,
  reward: { kind: 'rewardlang', hash: sha256Hex(reward) },
});

export function coachJob(input: Pick<CoachTraining, 'model' | 'entry' | 'skill' | 'revision' | 'seed'>) {
  const { model, entry, skill, revision } = input;
  const { minutes, delaySteps } = kitSchedule(model, entry).at(-1)!.stages[0];
  const job = kitJob(model, entry, { minutes, seed: input.seed ?? 1, reward: revision.reward, delaySteps });
  const policy = skill.controller.kind === 'policy' ? skill.controller.policy : null;

  return { ...job, name: `Coach: ${skill.name}`, warmPolicy: policy, logStdMin: LOG_STD_MIN };
}

function subjectProblem(input: CoachTraining): string | null {
  const { skill, environment, brief } = input;

  if (skill.controller.kind !== 'policy') return `Coaching retrains a policy, and ${skill.name} isn’t one.`;

  if (brief.skill !== skillHash(skill)) return 'The brief was measured on another version of this skill.';

  return skill.binding.contract === contractHash(environment.contract)
    ? null
    : 'The skill was proved on another contract. Recheck it in Arena first.';
}

const dropped = (reason: string, change: CoachChange, evidence: ArenaEvidence | null = null): CoachOutcome => ({
  kind: 'dropped',
  reason,
  change,
  evidence,
});

export async function trainRevision(input: CoachTraining): Promise<CoachOutcome> {
  const refused = subjectProblem(input);

  if (refused) return { kind: 'refused', reason: refused };

  const { mj, model, skill, revision, brief } = input;
  const judge = judgeOf(input);
  const tally: ForgeTally = { steps: 0, forgeRuns: 0 };
  const startedAt = Date.now();
  const job = coachJob(input);
  const outcome = await runCounted(input.forge, { name: job.name, xml: model.xml, job }, tally);
  const change: CoachChange = { ...revision, before: brief.signals[revision.signal], after: null };

  if (!outcome.ok || !outcome.policy) return dropped(lastError(outcome), change);

  const environment = coachedEnvironment(input.environment, revision.reward);
  const controller: SkillController = { kind: 'policy', policy: outcome.policy, robot: environment.robot };
  const after = (await judge.measure(controller, environment))[revision.signal];
  const moved = { ...change, after };

  if (!movedEnough(moved))
    return dropped(
      `${revision.signal} went from ${signalNumber(revision.signal, change.before)} to ${signalNumber(revision.signal, after)}, short of what was asked.`,
      moved,
    );

  const proof = await judge.prove({
    mj,
    model,
    design: input.design,
    name: skill.name,
    environment,
    controller,
    save: input.save,
    warmStartFrom: skillHash(skill),
    origin: () => ({
      method: skill.origin?.method ?? 'motor-kit',
      cost: { wallS: (Date.now() - startedAt) / 1000, steps: tally.steps },
    }),
  });

  if (!proof.skill) return dropped(proof.evidence.summary, moved, proof.evidence);

  return { kind: 'kept', skill: proof.skill, change: moved, evidence: proof.evidence };
}

export async function coachSkill(input: CoachInput): Promise<CoachOutcome> {
  const brief = await coachBrief(input);
  const answer = await input.ask({
    system: COACH_SYSTEM,
    prompt: coachPrompt(brief, input.words),
    signal: input.signal,
  });
  const read = readRevision(answer, brief.reward);

  if (!read.ok) return { kind: 'refused', reason: read.reason };

  return trainRevision({ ...input, brief, revision: read.revision });
}
