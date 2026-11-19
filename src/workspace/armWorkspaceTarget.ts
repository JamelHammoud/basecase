import type { RobotAnimation } from '../types/robotics';

export function workspaceTarget(
  animation: RobotAnimation,
  existing: readonly RobotAnimation[],
  robot?: string,
): RobotAnimation {
  const base = 'Workspace target';
  const taken = new Set(existing.map((entry) => entry.name));
  let name = base;
  let suffix = 2;

  while (taken.has(name)) {
    name = `${base} ${suffix}`;
    suffix++;
  }

  return { ...animation, id: crypto.randomUUID(), name, robot };
}
