import type { ScenePart } from '../types/robotics';
import type { FixedMate } from '../utils/robotImport/simready';

export function withFixedMates(parts: ScenePart[], fixedMates: FixedMate[] = []): ScenePart[] {
  return parts.map((p) => {
    const mates = p.robotLink ? fixedMates.filter((m) => m.link === p.robotLink!.link).map((m) => m.name) : [];

    return mates.length && p.robotLink ? { ...p, robotLink: { ...p.robotLink, fixedMates: mates } } : p;
  });
}
