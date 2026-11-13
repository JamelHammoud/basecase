import type { RobotJoint } from '../../types/robotics';
import { box, type FixtureRobot } from './parts';
import { fixtureRobots } from './robots';

export const SERVO_ARM_TIP_G = 500;

const NAMES = ['Shoulder', 'Elbow', 'Wrist'];

export const servoArmVariant = (joint: string) => (joint === 'arm0' ? 'c001' : 'c044');

export function servoArm(variant: (joint: string) => string = servoArmVariant): FixtureRobot {
  const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const top = Math.max(...arm.parts.map((p) => p.position[1] + p.dimensions.height / 2));
  const hand = box('hand', [0, top - 15, 0], [30, 30, 30], SERVO_ARM_TIP_G);
  const servos = arm.joints.map((j) => ({
    ...box(`${j.id}-servo`, [0, j.origin[1], 0], [24, 24, 24], 55),
    name: `${NAMES[arm.joints.indexOf(j)]} Servo`,
    kind: 'component' as const,
    componentId: 'feetech-sts3215',
    componentVariant: variant(j.id),
  }));
  const last = arm.joints.at(-1)!;
  const joints = arm.joints.map((j, i): RobotJoint => ({
    ...j,
    name: NAMES[i],
    parent: [...j.parent, `${j.id}-servo`],
    child: j === last ? [...j.child, hand.id] : j.child,
    actuators: [`${j.id}-servo`],
  }));

  return { ...arm, id: 'servo-arm', parts: [...arm.parts, hand, ...servos], joints };
}
