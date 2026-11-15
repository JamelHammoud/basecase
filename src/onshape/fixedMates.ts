import type { ScenePart } from '../types/robotics';
import type { FixedMate } from '../utils/robotImport/simready';

export function withFixedMates(parts: ScenePart[], fixedMates: FixedMate[] = []): ScenePart[] {
  const byLink = new Map<string, string[]>();

  for (const { link, name } of fixedMates) {
    const names = byLink.get(link) ?? [];

    names.push(name);
    byLink.set(link, names);
  }

  return parts.map((p) => {
    const mates = p.robotLink ? byLink.get(p.robotLink.link) : undefined;

    return mates?.length && p.robotLink ? { ...p, robotLink: { ...p.robotLink, fixedMates: [...mates] } } : p;
  });
}
