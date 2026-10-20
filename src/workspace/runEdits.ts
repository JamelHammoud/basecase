import type { ScenePart } from '../types/robotics';
import type { RunEdits } from './agentLanes';

export function recordEdit(edits: RunEdits, id: string, before: ScenePart | null): RunEdits {
  return Object.hasOwn(edits, id) ? edits : { ...edits, [id]: before };
}

export function revertEdits(parts: ScenePart[], edits: RunEdits): ScenePart[] {
  const present = new Set(parts.map((p) => p.id));
  const kept = parts.flatMap((p) => {
    if (!Object.hasOwn(edits, p.id)) return [p];

    const before = edits[p.id];

    return before ? [before] : [];
  });
  const restored = Object.values(edits).filter((p): p is ScenePart => !!p && !present.has(p.id));

  return [...kept, ...restored];
}
