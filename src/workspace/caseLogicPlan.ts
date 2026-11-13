import { compileCaseLogic, usesBodySkills } from '../cases/caseLogic';
import type { Case } from '../cases/schema';
import { sceneCapabilities } from '../routines/capabilities';
import { NO_BODY } from '../routines/physicsBody';
import type { RoutineKit } from '../routines/physicsKit';
import type { Plan } from '../routines/planTypes';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { sceneKit } from './routineCheck';

export interface CaseLogicScene {
  parts: ScenePart[];
  joints: RobotJoint[];
  buildModel: () => Promise<SimModel>;
}

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

  const model = await scene.buildModel();
  const kit = await sceneKit(model, joints, parts);
  const compiled = compileCaseLogic(kase.logic, { skills: kit.skills, modelHash: kit.modelHash, capabilities });

  if (!compiled.ok) return { plan: null, kit, refusal: compiled.errors[0].message };

  if (!model.robots.some((r) => r.floating)) return { plan: null, kit, refusal: NO_BODY };

  return { plan: compiled.plan, kit };
}
