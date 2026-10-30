import type { ScenePart } from '../types/robotics';
import type { AssemblyGeometry } from './assemblyGeometry';

export interface HeldBy {
  unheld: string[];
  declared: Array<{ id: string; how: string }>;
  captured: string[];
  checked: number;
}

const DECLARATION =
  /\b(hook[- ]and[- ]loop|velcro|strap|double[- ]sided|foam tape|tape|zip[- ]?ties?|cable ties?|glue[ds]?|adhesive|epoxy|press[- ]fit|snap[- ]fit|snaps?)\b/i;

const isCandidate = (p: ScenePart) =>
  p.role === 'solid' &&
  p.kind !== 'hardware' &&
  p.kind !== 'image_plane' &&
  !p.robotLink &&
  !p.simready &&
  !p.physics?.dynamic;

function fastened(g: AssemblyGeometry): Set<string> {
  const held = new Set<string>();

  for (const c of g.chains.screws) {
    const intoPart = c.endsIn.kind === 'component' || c.endsIn.kind === 'printed';
    const joined = new Set([...c.stack, ...(intoPart && c.endsIn.id ? [c.endsIn.id] : [])]);
    const holds = joined.size >= 2 && !c.problems.some((p) => p.code === 'air');

    if (holds) joined.forEach((id) => held.add(id));
  }

  return held;
}

export function heldBy(parts: ScenePart[], g: AssemblyGeometry): HeldBy {
  const candidates = parts.filter(isCandidate).filter((p) => g.moves[p.id]);

  if (candidates.length < 2) return { unheld: [], declared: [], captured: [], checked: candidates.length };

  const held = fastened(g);
  const loose = candidates.filter((p) => !held.has(p.id));
  const captured = loose.filter((p) => g.moves[p.id].captured).map((p) => p.id);
  const open = loose.filter((p) => !g.moves[p.id].captured);
  const declared = open.flatMap((p) => {
    const m = DECLARATION.exec(p.note ?? '');

    return m ? [{ id: p.id, how: m[1].toLowerCase() }] : [];
  });
  const declaredIds = new Set(declared.map((d) => d.id));

  return {
    unheld: open.filter((p) => !declaredIds.has(p.id)).map((p) => p.id),
    declared,
    captured,
    checked: candidates.length,
  };
}
