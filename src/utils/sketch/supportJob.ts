import type { ScenePart } from '../../types/robotics';
import { supportWork } from './supportState';
import { supportWorkerPart, validSupport } from './support';
import { withinSupportBudget } from './supportBudget';

export function prepareSupportJob(parts: ScenePart[]) {
  const work = supportWork(parts);

  if (!work.pending.length) return null;

  const wanted = new Set(work.bound.map((p) => p.id));

  for (const part of work.bound) {
    const support = part.sketch!.support;

    if (validSupport(support)) wanted.add(support.partId);
  }

  const input = work.flat.filter((p) => wanted.has(p.id)).map(supportWorkerPart);

  return { parts: input, force: work.pending.map((p) => p.id), bounded: withinSupportBudget(input) };
}
