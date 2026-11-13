import type { MainModule } from '@mujoco/mujoco';
import type { Skill } from '../skills/artifacts';
import type { Environment } from '../skills/environment';
import type { ForgeRunner, SkillSave } from '../skills/forgeRunner';
import { trainHandoffSkill } from '../skills/handoff';
import { handoffStates, proveHandoff, type KitScene } from './physicsKit';
import type { Handoff, TransitionProof } from './schema';

export interface HandoffTrainInput {
  mj: MainModule;
  scene: Omit<KitScene, 'mj'>;
  design: string;
  pair: Handoff;
  target: Skill;
  environment: Environment;
  forge: ForgeRunner;
  save: SkillSave;
  seed?: number;
}

export interface HandoffResult {
  skill: Skill | null;
  proof: TransitionProof | null;
  reason: string;
}

export async function trainHandoff(input: HandoffTrainInput): Promise<HandoffResult> {
  const { mj, pair, target } = input;
  const scene: KitScene = { ...input.scene, mj };
  const states = handoffStates(scene, pair.from);

  if (!states) return { skill: null, proof: null, reason: `${pair.from} falls before it hands off.` };

  const candidate = await trainHandoffSkill({ ...input, model: scene.model, states });

  if (!candidate.skill) return { skill: null, proof: null, reason: candidate.reason };

  const trained = candidate.skill;
  const skills = scene.skills.map((s) => (s === target ? trained : s));
  const proof = proveHandoff({ ...scene, skills }, pair);

  if (!proof || proof.falls > 0)
    return {
      skill: null,
      proof: null,
      reason: `${pair.from} to ${pair.to} still fell in ${proof?.falls ?? '?'} tries.`,
    };

  return { skill: trained, proof, reason: candidate.reason };
}
