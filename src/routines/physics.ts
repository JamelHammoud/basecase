import type { MainModule } from '@mujoco/mujoco';
import { modelOf } from '../skills/fixtureModels';
import { loadKitLibrary } from './kitLibrary';
import { scriptedDrive } from './physicsDrive';
import { kitForModel, type KitOptions, type KitRobot, type RoutineKit } from './physicsKit';
import { type PhysicsScenarioResult, runPhysics } from './physicsRun';
import type { Plan } from './planTypes';
import type { Scenario } from './scenarioTypes';

export type { KitRobot, RoutineKit } from './physicsKit';
export { PhysicsRun, type PhysicsSample, type PhysicsScenarioResult } from './physicsRun';

export function runPhysicsScenario(
  plan: Plan,
  scenario: Scenario,
  options: { mj: MainModule; robot: KitRobot; kit: RoutineKit },
): Promise<PhysicsScenarioResult> {
  const { mj, robot, kit } = options;

  return runPhysics({ mj, plan, scenario, model: modelOf(robot), joints: robot.joints, kit });
}

export async function routineKit(mj: MainModule, robot: KitRobot, options: KitOptions = {}): Promise<RoutineKit> {
  const skills = options.skills ?? (await loadKitLibrary());
  const model = options.model ?? modelOf(robot);
  const drive = scriptedDrive(model, robot.joints, robot.parts);

  return kitForModel({ mj, model, joints: robot.joints, skills, drive });
}
