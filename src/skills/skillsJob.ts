import { localJudgments } from './localJudgments';
import { sampleArmWorkspace, type WorkspaceRequest, type WorkspaceSamples } from './armWorkspace';
import { planArmMotion, type ArmMotionInput, type ArmMotionResult } from './armMotion';
import type { MainModule } from '@mujoco/mujoco';
import { trainHandoff, type HandoffResult, type HandoffTrainInput } from '../routines/handoffTraining';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import { proveOnTwin } from '../fleet/twinArena';
import type { ArenaEvidence, Skill } from './artifacts';
import { coachBrief, trainRevision, type CoachBrief, type CoachOutcome, type CoachRevision } from './coach';
import type { Environment } from './environment';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import type { TrainedEntry } from './kitEnvironment';
import { trainKitEntry, type KitOutcome, type KitWarm } from './motorKit';
import type { KitContext } from './kitTransitions';
import { trainMove, type MoveOutcome } from './moves';
import type { RaceOutcome } from './race';
import { stressSkill, type StressResult } from './stress';
import { trainOnFindings, type StressTraining, type StressTrainOutcome } from './stressTrain';
import { draftSkill, raceDraft, recheckSkill, type DraftInput, type DraftResult, type SkillDraft } from './teach';

export type SkillsJob =
  | { type: 'workspace-motion'; model: SimModel; request: Omit<ArmMotionInput, 'stop'> }
  | { type: 'workspace'; model: SimModel; request: Omit<WorkspaceRequest, 'stop'> }
  | { type: 'draft'; model: SimModel; design: string; request: DraftInput }
  | { type: 'race'; model: SimModel; draft: SkillDraft; budgetSteps?: number; seed?: number }
  | ({ type: 'kit'; model: SimModel; design: string; entry: TrainedEntry; warm?: KitWarm; seed?: number } & KitContext)
  | { type: 'move'; model: SimModel; design: string; animation: RobotAnimation; seed?: number }
  | { type: 'recheck'; model: SimModel; design: string; skill: Skill; environment: Environment }
  | ({ type: 'handoff' } & Omit<HandoffTrainInput, 'mj' | 'forge' | 'save'>)
  | ({ type: 'coach-brief'; model: SimModel } & CoachSubjectJob)
  | ({ type: 'coach'; model: SimModel } & CoachJob)
  | { type: 'stress'; model: SimModel; skill: Skill; environment: Environment; budget?: number }
  | { type: 'twin'; model: SimModel; skill: Skill; environment: Environment }
  | ({ type: 'stress-train' } & Omit<StressTraining, 'mj' | 'forge' | 'save' | 'judge'>);

export interface CoachSubjectJob {
  skill: Skill;
  environment: Environment;
  reward: string;
}

export interface CoachJob extends CoachSubjectJob {
  design: string;
  entry: TrainedEntry;
  brief: CoachBrief;
  revision: CoachRevision;
}

export type SkillsReply =
  | { type: 'workspace-motion'; result: ArmMotionResult }
  | { type: 'workspace'; samples: WorkspaceSamples }
  | { type: 'draft'; result: DraftResult }
  | { type: 'race'; outcome: RaceOutcome }
  | { type: 'kit'; outcome: KitOutcome }
  | { type: 'move'; outcome: MoveOutcome }
  | { type: 'recheck'; skill: Skill | null }
  | { type: 'handoff'; result: HandoffResult }
  | { type: 'coach-brief'; brief: CoachBrief }
  | { type: 'coach'; outcome: CoachOutcome }
  | { type: 'stress'; result: StressResult }
  | { type: 'twin'; evidence: ArenaEvidence }
  | { type: 'stress-train'; outcome: StressTrainOutcome };

export type ReplyTo<K extends SkillsJob['type']> = Extract<SkillsReply, { type: K }>;

export interface SkillPorts {
  localSalt?: string;
  forge: ForgeRunner;
  save: SkillSave;
  signal?: AbortSignal;
  progress?: (share: number) => void;
}

export async function runSkillsJob(job: SkillsJob, ports: SkillPorts & { mj: MainModule }): Promise<SkillsReply> {
  const { mj, forge, save, signal, progress } = ports;
  const judgment = localJudgments(ports.localSalt);

  if (job.type === 'workspace-motion')
    return {
      type: 'workspace-motion',
      result: await planArmMotion(mj, job.model, { ...job.request, stop: () => signal?.aborted ?? false }),
    };

  if (job.type === 'workspace')
    return {
      type: 'workspace',
      samples: await sampleArmWorkspace(mj, job.model, { ...job.request, stop: () => signal?.aborted ?? false }),
    };

  if (job.type === 'draft') return { type: 'draft', result: await draftSkill({ mj, ...job }) };

  if (job.type === 'race')
    return { type: 'race', outcome: await raceDraft({ mj, ...job, forge, save, signal, judgment }) };

  if (job.type === 'kit')
    return { type: 'kit', outcome: await trainKitEntry({ mj, ...job, forge, save, signal, judgment }) };

  if (job.type === 'move')
    return { type: 'move', outcome: await trainMove({ mj, ...job, forge, save, signal, judgment }) };

  if (job.type === 'handoff') return { type: 'handoff', result: await trainHandoff({ mj, ...job, forge, save }) };

  if (job.type === 'coach-brief') return { type: 'coach-brief', brief: await coachBrief({ mj, ...job }) };

  if (job.type === 'coach') return { type: 'coach', outcome: await trainRevision({ mj, ...job, forge, save }) };

  if (job.type === 'stress') return { type: 'stress', result: await stressSkill({ mj, ...job, onProgress: progress }) };

  if (job.type === 'twin') return { type: 'twin', evidence: await proveOnTwin({ mj, ...job }) };

  if (job.type === 'stress-train')
    return { type: 'stress-train', outcome: await trainOnFindings({ mj, ...job, forge, save }) };

  return { type: 'recheck', skill: await recheckSkill({ mj, ...job, save }) };
}
