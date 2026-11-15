import type { FastenerHome } from './guideOrder';

export function fastenerSteps(majors: string[], fasteners: string[], homes: Map<string, FastenerHome>) {
  const rank = new Map<string, number>();
  const ready = majors.map((): string[] => []);
  const pending: string[] = [];

  majors.forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index);
  });

  for (const id of fasteners) {
    let step = 0;

    for (const gate of homes.get(id)!.gate) step = Math.max(step, rank.get(gate) ?? Infinity);

    if (step < ready.length) ready[step].push(id);
    else pending.push(id);
  }

  return { ready, pending };
}
