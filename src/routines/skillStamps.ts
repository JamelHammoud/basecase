import type { Skill, SkillController } from '../skills/artifacts';
import { hashOf } from '../skills/hash';
import type { DriveSetup } from '../sim/drive';
import { KIT_SKILL_NAMES } from './physicsBody';
import type { Handoff } from './schema';
import { skillId } from './skillNames';

export interface StampScene {
  skills: readonly Skill[];
  drive?: DriveSetup | null;
}

const KIT_NAMES = new Set<string>(Object.values(KIT_SKILL_NAMES));
const VELOCITY_SKILLS = new Set(['walk', 'turn-away']);
const stamps = new WeakMap<SkillController, string>();

export function controllerStamp(controller: SkillController): string {
  const known = stamps.get(controller);

  if (known) return known;

  const stamp =
    controller.kind === 'policy'
      ? hashOf({ ...controller.policy, layers: controller.policy.layers.map((l) => [l.in, l.out, l.b]) })
      : hashOf(controller);

  stamps.set(controller, stamp);

  return stamp;
}

const named = (skills: readonly Skill[], names: string[]) =>
  names.map((name) => skills.find((s) => s.name === name)).find((s) => s !== undefined);

function runningSkill(skills: readonly Skill[], id: string): Skill | undefined {
  if (VELOCITY_SKILLS.has(id)) return named(skills, [KIT_SKILL_NAMES.velocity]);

  const own = skills.findLast((s) => !KIT_NAMES.has(s.name) && skillId(s.name) === id);

  return own ?? named(skills, [KIT_SKILL_NAMES.settle, KIT_SKILL_NAMES.stand]);
}

export function skillStamp(scene: StampScene, id: string): string {
  const skill = runningSkill(scene.skills, id);

  return skill ? controllerStamp(skill.controller) : `drive:${scene.drive?.kind ?? 'none'}`;
}

export const pairStamp = (scene: StampScene, pair: Handoff) =>
  `${skillStamp(scene, pair.from)}>${skillStamp(scene, pair.to)}`;
