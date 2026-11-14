import type { MainModule } from '@mujoco/mujoco';
import { trainHandoff, type HandoffResult, type HandoffTrainInput } from '../routines/handoffTraining';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Skill } from './artifacts';
import { coachBrief, trainRevision, type CoachBrief, type CoachOutcome, type CoachRevision } from './coach';
import type { Environment } from './environment';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import type { TrainedEntry } from './kitEnvironment';
import { trainKitEntry, type KitOutcome, type KitWarm } from './motorKit';
import { trainMove, type MoveOutcome } from './moves';
import type { RaceOutcome } from './race';
import { draftSkill, raceDraft, recheckSkill, type DraftInput, type DraftResult, type SkillDraft } from './teach';

export type SkillsJob =
  | { type: 'draft'; model: SimModel; design: string; request: DraftInput }
  | { type: 'race'; model: SimModel; draft: SkillDraft; budgetSteps?: number }
  | { type: 'kit'; model: SimModel; design: string; entry: TrainedEntry; warm?: KitWarm }
  | { type: 'move'; model: SimModel; design: string; animation: RobotAnimation }
  | { type: 'recheck'; model: SimModel; design: string; skill: Skill; environment: Environment }
  | ({ type: 'handoff' } & Omit<HandoffTrainInput, 'mj' | 'forge' | 'save'>)
  | ({ type: 'coach-brief'; model: SimModel } & CoachSubjectJob)
  | ({ type: 'coach'; model: SimModel } & CoachJob);

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
  | { type: 'draft'; result: DraftResult }
  | { type: 'race'; outcome: RaceOutcome }
  | { type: 'kit'; outcome: KitOutcome }
  | { type: 'move'; outcome: MoveOutcome }
  | { type: 'recheck'; skill: Skill | null }
  | { type: 'handoff'; result: HandoffResult }
  | { type: 'coach-brief'; brief: CoachBrief }
  | { type: 'coach'; outcome: CoachOutcome };

export type ReplyTo<K extends SkillsJob['type']> = Extract<SkillsReply, { type: K }>;

export interface SkillPorts {
  forge: ForgeRunner;
  save: SkillSave;
  signal?: AbortSignal;
}

export async function runSkillsJob(job: SkillsJob, ports: SkillPorts & { mj: MainModule }): Promise<SkillsReply> {
  const { mj, forge, save, signal } = ports;

  if (job.type === 'draft') return { type: 'draft', result: await draftSkill({ mj, ...job }) };

  if (job.type === 'race') return { type: 'race', outcome: await raceDraft({ mj, ...job, forge, save, signal }) };

  if (job.type === 'kit') return { type: 'kit', outcome: await trainKitEntry({ mj, ...job, forge, save, signal }) };

  if (job.type === 'move') return { type: 'move', outcome: await trainMove({ mj, ...job, forge, save, signal }) };

  if (job.type === 'handoff') return { type: 'handoff', result: await trainHandoff({ mj, ...job, forge, save }) };

  if (job.type === 'coach-brief') return { type: 'coach-brief', brief: await coachBrief({ mj, ...job }) };

  if (job.type === 'coach') return { type: 'coach', outcome: await trainRevision({ mj, ...job, forge, save }) };

  return { type: 'recheck', skill: await recheckSkill({ mj, ...job, save }) };
}
