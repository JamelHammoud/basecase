import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Skill } from './artifacts';
import type { Environment } from './environment';
import { kitEnvironment, type TrainedEntry } from './kitEnvironment';
import { moveEnvironment } from './moveEnvironment';
import { moveTag, recordEnvironment, skillRecord, withRecordRanges, type SkillRecord } from './skillRecords';
import type { SkillRow, SkillTarget } from './skillRows';
import type { StressResult } from './stress';
import type { StressTarget } from './stressTraining';

export interface StressRow {
  target: SkillTarget;
  label: string;
  record: SkillRecord;
  skill: Skill;
  environment: Environment;
}

export interface RowScene {
  model: SimModel;
  animations: readonly RobotAnimation[];
  drafted: (target: SkillTarget) => Environment | null;
}

function environmentOf(row: SkillRow, scene: RowScene): Environment | null {
  const { model, animations } = scene;

  if (row.kit) return withRecordRanges(kitEnvironment(model, row.kit), row.record);

  if (row.move) return withRecordRanges(moveEnvironment(model, row.move), row.record);

  return scene.drafted(row.target) ?? (row.record ? recordEnvironment(row.record, model, animations) : null);
}

export function rowEnvironment(row: SkillRow, scene: RowScene): Environment | null {
  try {
    return environmentOf(row, scene);
  } catch {
    return null;
  }
}

export function stressTargetOf(row: SkillRow): StressTarget | null {
  if (row.kit) return { kit: row.kit };

  return row.move ? { move: row.move.id } : null;
}

export const stressedRecord = (record: SkillRecord, result: StressResult): SkillRecord => ({
  ...record,
  stress: { seed: result.seed, budget: result.budget, rollouts: result.rollouts, findings: result.findings },
});

function retrainedTag(skill: Skill, kind: StressTarget, environment: Environment): SkillRecord {
  if ('kit' in kind) return skillRecord(skill, { kit: kind.kit });

  return skillRecord(skill, { kit: null, move: moveTag(kind.move, environment) });
}

export const retrainedRecord = (skill: Skill, kind: StressTarget, widened: Environment): SkillRecord => ({
  ...retrainedTag(skill, kind, widened),
  randomization: widened.randomization,
});

export function recheckedRecord(
  skill: Skill,
  task: { entry: TrainedEntry | null; move: RobotAnimation | null; record: SkillRecord },
  environment: Environment,
): SkillRecord {
  const move = task.move ? moveTag(task.move.id, environment) : undefined;

  return skillRecord(skill, { kit: task.entry, move, randomization: task.record.randomization });
}
