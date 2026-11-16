import type { LocalJudgment } from './localJudgments';
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
import type { KitTransitionEvidence } from './kitTransitions';
import { selectionOf } from './seedSelection';

export interface ProveInput {
  judgment?: LocalJudgment;
  mj: MainModule;
  model: SimModel;
  design: string;
  name: string;
  environment: Environment;
  controller: SkillController;
  save: SkillSave;
  origin?: () => SkillOrigin;
  warmStartFrom?: string;
  kitValidation?: KitTransitionEvidence;
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
  const evidence = await runArena({
    mj,
    model,
    contract: environment.contract,
    controller,
    environment,
    salt: input.judgment?.(),
  });

  if (!evidence.passed) return { skill: null, evidence };

  const proven = {
    ...withEvidence(draft, evidence, environment),
    ...(input.kitValidation ? { kitValidation: input.kitValidation } : {}),
  };
  const training = controller.kind === 'policy' ? selectionOf(controller.policy) : undefined;
  const origin = input.origin?.();
  const skill: Skill = origin ? { ...proven, origin: { ...origin, ...(training ? { training } : {}) } } : proven;

  await input.save(skillFiles(skillHash(skill)).skill, JSON.stringify(skill));

  return { skill, evidence };
}
