import type { ScenePart } from '../types/robotics';
import type { WorldItem } from '../sim/mjcfTypes';

export function withoutWorldSources(parts: ScenePart[], world: ScenePart[]): ScenePart[] {
  const sources = new Set(
    world.flatMap((part) => ((part as WorldItem).sourcePartId ? [(part as WorldItem).sourcePartId!] : [])),
  );

  return sources.size ? parts.filter((part) => !sources.has(part.id)) : parts;
}
