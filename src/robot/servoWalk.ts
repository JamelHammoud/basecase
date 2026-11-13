import type { RobotJoint } from '../types/robotics';
import type { JointStatus, ServoFamily } from './robotState';
import { servoLayout } from './sceneRobot';

export const FACTORY_ID = 1;

export const SERVO_MODEL: Record<ServoFamily, number> = { feetech: 777, dynamixel: 1200 };

export interface ServoWalkStep {
  jointId: string;
  name: string;
  id: number;
  link: string[];
}

export function servoWalk(joints: readonly RobotJoint[]): ServoWalkStep[] {
  const { movable, ids } = servoLayout(joints);

  return movable.map((j, i) => ({ jointId: j.id, name: j.name, id: ids[i], link: [...j.child] })).reverse();
}

export const servoAnswers = (status: readonly JointStatus[], id: number) =>
  status.some((j) => j.id === id && j.reply === 'ok');

export function servoStepsToDo(walk: readonly ServoWalkStep[], status: readonly JointStatus[]): ServoWalkStep[] {
  const othersAnswer = walk.every((s) => s.id === FACTORY_ID || servoAnswers(status, s.id));
  const factoryDone = othersAnswer && servoAnswers(status, FACTORY_ID);

  return walk.filter((s) => (s.id === FACTORY_ID ? !factoryDone : !servoAnswers(status, s.id)));
}
