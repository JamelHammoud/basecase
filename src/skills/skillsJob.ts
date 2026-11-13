import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Skill } from './artifacts';
import type { Environment } from './environment';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import type { TrainedEntry } from './kitEnvironment';
import { trainKitEntry, type KitOutcome } from './motorKit';
import { trainMove, type MoveOutcome } from './moves';
import type { RaceOutcome } from './race';
import { draftSkill, raceDraft, recheckSkill, type DraftInput, type DraftResult, type SkillDraft } from './teach';

export type SkillsJob =
  | { type: 'draft'; model: SimModel; design: string; request: DraftInput }
  | { type: 'race'; model: SimModel; draft: SkillDraft; budgetSteps?: number }
  | { type: 'kit'; model: SimModel; design: string; entry: TrainedEntry }
  | { type: 'move'; model: SimModel; design: string; animation: RobotAnimation }
  | { type: 'recheck'; model: SimModel; design: string; skill: Skill; environment: Environment };

export type SkillsReply =
  | { type: 'draft'; result: DraftResult }
  | { type: 'race'; outcome: RaceOutcome }
  | { type: 'kit'; outcome: KitOutcome }
  | { type: 'move'; outcome: MoveOutcome }
  | { type: 'recheck'; skill: Skill | null };

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

  return { type: 'recheck', skill: await recheckSkill({ mj, ...job, save }) };
}
