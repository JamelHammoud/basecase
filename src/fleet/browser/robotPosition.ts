import { locatePose } from '../sites/registration.mjs';
import type { RegistryItem } from './client';

export function robotPosition(robot: RegistryItem) {
  if (robot.pose?.frame === 'facility' && robot.pose.facility !== robot.facility?.hash) return null;

  return locatePose(robot.pose!, robot.registration ?? null);
}
