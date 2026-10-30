import type { ScenePart } from '../types/robotics';
import type { Clamps } from './followers';

interface Entry {
  clamped: string[];
  parts: ScenePart[];
}

const remembered = new WeakMap<ScenePart, Entry>();

export function rememberClamps(parts: ScenePart[], clamps: Clamps): void {
  const byId = new Map(parts.map((p) => [p.id, p]));

  for (const [id, clamped] of Object.entries(clamps)) {
    const self = byId.get(id);
    const members = clamped.filter((c) => !c.startsWith('@')).map((c) => byId.get(c));

    if (self && members.every(Boolean)) remembered.set(self, { clamped, parts: members as ScenePart[] });
  }
}

export function knownClamps(parts: ScenePart[]): Clamps {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out: Clamps = {};

  for (const p of parts) {
    const entry = remembered.get(p);

    if (entry && entry.parts.every((m) => byId.get(m.id) === m)) out[p.id] = entry.clamped;
  }

  return out;
}
