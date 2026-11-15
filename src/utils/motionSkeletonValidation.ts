import type { Mocap } from './mocapBones';

export function motionDataProblem(motion: Mocap): { problem: string; limb: string } | undefined {
  const lengths = new Map<string, number>();

  for (let frame = 0; frame < motion.frames; frame++) {
    const time = frame * motion.frameTime;
    const points = motion.sample(time);
    const rotations = motion.rotations!(time);

    for (const bone of motion.bones) {
      const point = points.get(bone);
      const channels = rotations.get(bone) ?? [];

      if (
        !point ||
        !point.toArray().every(Number.isFinite) ||
        channels.some((channel) => !Number.isFinite(channel.degrees))
      )
        return { problem: `The ${bone} motion has a missing or non-finite frame.`, limb: bone };

      const parent = motion.parentOf.get(bone);
      const parentPoint = parent ? points.get(parent) : undefined;

      if (!parentPoint) continue;

      const length = point.distanceTo(parentPoint);
      const first = lengths.get(bone) ?? length;

      lengths.set(bone, first);

      if (Math.abs(length - first) > Math.max(0.0001, first * 0.00001))
        return { problem: `The ${bone} motion changes a link length and can’t use revolute joints.`, limb: bone };
    }
  }

  return undefined;
}
