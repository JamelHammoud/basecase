import type { Mocap } from './mocapBones';

export function motionWithEndSites(motion: Mocap): Mocap {
  const ends = motion.endSites;

  if (!ends?.rest.size) return motion;

  return {
    ...motion,
    bones: [...motion.bones, ...ends.rest.keys()],
    rest: new Map([...motion.rest, ...ends.rest]),
    parentOf: new Map([...motion.parentOf, ...ends.parentOf]),
    sample: (time) => new Map([...motion.sample(time), ...ends.sample(time)]),
  };
}
