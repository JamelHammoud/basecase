import type { RobotSkeleton } from '../types/skeleton';
import { actuatorOptions } from './actuatorCatalog';
import { sizeActuators } from './actuatorSizing';
import { skeletonSizing } from './skeletonSizing';

export const LINK_OUTLINE = ['feetech-sts3215', 'feetech-sts3250', 'waveshare-st3215-hs'];

export interface ServoPick {
  keys: string[];
  names: string[];
  volts: number;
  rail: string;
  servosUsd: number;
  costUsd: number;
}

const componentOf = (key: string) => key.split('|')[0].replace(/^component:/, '');

export const linkServos = () => actuatorOptions().filter((o) => LINK_OUTLINE.includes(componentOf(o.key)));

export function armServos(skeleton: RobotSkeleton): ServoPick | { joint: string } {
  const input = skeletonSizing(skeleton);

  if (typeof input === 'string') return { joint: skeleton.joints[0]?.name ?? 'arm' };

  const families = sizeActuators({ ...input, options: linkServos() });
  const family = families.find((f) => !f.failures.length);

  if (!family) {
    const failing = families[0]?.failures[0]?.joint ?? input.joints[input.joints.length - 1];

    return { joint: failing.name };
  }

  return {
    keys: family.picks.map((p) => p.pick!.option.key),
    names: family.picks.map((p) => p.pick!.option.name),
    volts: family.rail.volts,
    rail: family.rail.name,
    servosUsd: family.actuatorsUsd,
    costUsd: family.costUsd,
  };
}
