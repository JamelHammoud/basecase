import type { RobotJoint } from '../types/robotics';
import { linkAngles } from './linkageKinematics';

const wrapped = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export function loopValue(j: RobotJoint, driverValue: number): number {
  const { fourBar, link } = j.loop!;
  const rest = linkAngles(fourBar, fourBar.theta);
  const now = linkAngles(fourBar, fourBar.theta + driverValue);

  if (!rest || !now) return 0;

  if (link === 'rocker') return wrapped(now.rocker - rest.rocker);

  return wrapped(now.coupler - rest.coupler - driverValue);
}
