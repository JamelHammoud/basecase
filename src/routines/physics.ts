import type { MainModule } from '@mujoco/mujoco';
import { modelOf } from '../skills/fixtureModels';
import type { KitRobot, RoutineKit } from './physicsKit';
import { type PhysicsScenarioResult, runPhysics } from './physicsRun';
import type { Plan } from './planTypes';
import type { Scenario } from './scenarioTypes';

export { routineKit, type KitRobot, type RoutineKit } from './physicsKit';
export { PhysicsRun, type PhysicsSample, type PhysicsScenarioResult } from './physicsRun';

export function runPhysicsScenario(
  plan: Plan,
  scenario: Scenario,
  options: { mj: MainModule; robot: KitRobot; kit: RoutineKit },
): Promise<PhysicsScenarioResult> {
  const { mj, robot, kit } = options;

  return runPhysics({ mj, plan, scenario, model: modelOf(robot), joints: robot.joints, kit });
}
