import { compileCaseLogic, usesBodySkills } from '../cases/caseLogic';
import type { Case } from '../cases/schema';
import { sceneCapabilities } from '../routines/capabilities';
import { NO_BODY } from '../routines/physicsBody';
import type { RoutineKit } from '../routines/physicsKit';
import type { Plan } from '../routines/planTypes';
import { withHandoffs } from '../routines/handoffs';
import { NO_ROUTINE_SKILLS, sceneKit, type RoutineScene } from './routineCheck';

export type CaseLogicScene = RoutineScene;

export interface CaseLogicPlan {
  plan: Plan | null;
  kit: RoutineKit | null;
  refusal?: string;
}

export async function caseLogicPlan(kase: Case, scene: CaseLogicScene): Promise<CaseLogicPlan> {
  if (!kase.logic) return { plan: null, kit: null };

  const { parts, joints } = scene;
  const capabilities = sceneCapabilities({ parts, joints });
  const bare = compileCaseLogic(kase.logic, { skills: [], capabilities });

  if (bare.ok && !usesBodySkills(bare.plan)) return { plan: bare.plan, kit: null };

  const skills = scene.skills ?? NO_ROUTINE_SKILLS;
  const [model, own] = await Promise.all([scene.buildModel(), skills.own()]);
  const kit = await sceneKit(model, { joints, parts, own });
  const contracts = withHandoffs(kit.skills, skills.handoffs());
  const compiled = compileCaseLogic(kase.logic, { skills: contracts, modelHash: kit.modelHash, capabilities });

  if (!compiled.ok) return { plan: null, kit, refusal: compiled.errors[0].message };

  if (!model.robots.some((r) => r.floating)) return { plan: null, kit, refusal: NO_BODY };

  return { plan: compiled.plan, kit };
}
