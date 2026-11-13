import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import { runArena } from './arena';
import {
  currentDesign,
  skillFiles,
  skillFromTraining,
  skillHash,
  withEvidence,
  type ArenaEvidence,
  type Skill,
  type SkillController,
  type SkillOrigin,
} from './artifacts';
import type { Environment } from './environment';
import type { SkillSave } from './forgeRunner';

export interface ProveInput {
  mj: MainModule;
  model: SimModel;
  design: string;
  name: string;
  environment: Environment;
  controller: SkillController;
  save: SkillSave;
  origin?: () => SkillOrigin;
  warmStartFrom?: string;
}

export interface Proof {
  skill: Skill | null;
  evidence: ArenaEvidence;
}

export async function proveSkill(input: ProveInput): Promise<Proof> {
  const { mj, model, design, name, environment, controller } = input;
  const current = currentDesign({ design, model, environment });
  const trained = skillFromTraining({ name, start: null, current, environment, controller });
  const draft = input.warmStartFrom ? { ...trained, warmStartFrom: input.warmStartFrom } : trained;
  const evidence = await runArena({ mj, model, contract: environment.contract, controller, environment });

  if (!evidence.passed) return { skill: null, evidence };

  const proven = withEvidence(draft, evidence, environment);
  const skill: Skill = input.origin ? { ...proven, origin: input.origin() } : proven;

  await input.save(skillFiles(skillHash(skill)).skill, JSON.stringify(skill));

  return { skill, evidence };
}
