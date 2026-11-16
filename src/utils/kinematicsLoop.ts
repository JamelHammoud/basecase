import type { RobotJoint } from '../types/robotics';
import { linkAngle } from './linkageKinematics';

const wrapped = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export function loopValue(j: Pick<RobotJoint, 'loop'>, driverValue: number): number {
  const { fourBar, link } = j.loop!;
  const rest = linkAngle(fourBar, fourBar.theta, link);
  const now = linkAngle(fourBar, fourBar.theta + driverValue, link);

  if (rest === null || now === null) return 0;

  if (link === 'rocker') return wrapped(now - rest);

  return wrapped(now - rest - driverValue);
}
