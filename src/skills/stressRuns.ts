import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Skill } from './artifacts';
import type { Environment } from './environment';
import { kitEnvironment } from './kitEnvironment';
import { moveEnvironment } from './moveEnvironment';
import { moveTag, recordEnvironment, skillRecord, type SkillRecord } from './skillRecords';
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

  if (row.kit) return kitEnvironment(model, row.kit);

  if (row.move) return moveEnvironment(model, row.move);

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

export function retrainedRecord(skill: Skill, kind: StressTarget, environment: Environment): SkillRecord {
  if ('kit' in kind) return skillRecord(skill, { kit: kind.kit });

  return skillRecord(skill, { kit: null, move: moveTag(kind.move, environment) });
}
