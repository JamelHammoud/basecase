export function actuatorDefaults<T extends { actuator: number }>(
  joints: readonly T[],
  valueOf: (joint: T, index: number) => number,
): number[] {
  const width = joints.reduce((size, joint) => Math.max(size, joint.actuator + 1), 0);
  const values = new Array<number>(width).fill(0);

  joints.forEach((joint, index) => {
    if (joint.actuator >= 0) values[joint.actuator] = valueOf(joint, index);
  });

  return values;
}
