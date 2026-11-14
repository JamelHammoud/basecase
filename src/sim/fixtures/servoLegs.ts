import type { RobotJoint } from '../../types/robotics';
import { box, type FixtureRobot } from './parts';
import { fixtureRobots } from './robots';

export interface FixtureServo {
  componentId: string;
  variant?: string;
}

export function withServos(id: string, servo: FixtureServo): FixtureRobot {
  const robot = fixtureRobots().find((r) => r.id === id);

  if (!robot) throw new Error(`No fixture robot ${id}.`);

  const servos = robot.joints.map((j) => ({
    ...box(`${j.id}-servo`, j.origin, [24, 24, 24], 55),
    name: `${j.id} servo`,
    kind: 'component' as const,
    componentId: servo.componentId,
    ...(servo.variant ? { componentVariant: servo.variant } : {}),
  }));
  const joints = robot.joints.map((j): RobotJoint => ({
    ...j,
    parent: [...j.parent, `${j.id}-servo`],
    actuators: [`${j.id}-servo`],
  }));

  return { ...robot, id: `${id}-${servo.componentId}`, parts: [...robot.parts, ...servos], joints };
}
