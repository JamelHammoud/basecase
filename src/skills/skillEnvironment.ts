import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Environment } from './environment';
import { kitEnvironment } from './kitEnvironment';
import { moveEnvironment } from './moveEnvironment';
import { recordEnvironment } from './skillRecords';
import type { SkillRow } from './skillRows';
import type { SkillsRuntime } from './skillsRuntime';

export function skillEnvironment(
  row: SkillRow,
  scene: { model: SimModel; runtime: SkillsRuntime; animations: readonly RobotAnimation[] },
): Environment | null {
  const { model, runtime, animations } = scene;

  if (row.kit) return kitEnvironment(model, row.kit);

  if (row.move) return moveEnvironment(model, row.move);

  return runtime.environmentOf(row.target) ?? (row.record ? recordEnvironment(row.record, model, animations) : null);
}
