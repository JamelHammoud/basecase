import type { ScenePart } from '../types/robotics';

const quoted = (ids: string[]) => ids.map((id) => `"${id}"`).join(', ');

export function twinHints(edited: string[], before: ScenePart[], after: ScenePart[]): string[] {
  const sources = edited.filter((id) => after.some((p) => p.mirrorOf?.id === id));
  const copies = edited
    .map((id) => before.find((p) => p.id === id))
    .filter((p): p is ScenePart => !!p?.mirrorOf && !sources.includes(p.mirrorOf.id));
  const hints: string[] = [];

  if (sources.length) {
    const twins = after.filter((p) => p.mirrorOf && sources.includes(p.mirrorOf.id)).map((p) => p.id);

    hints.push(
      `Mirror twins out of date: ${twins.join(', ')}. Run mirror_parts([${quoted(sources)}]) again to update them.`,
    );
  }

  for (const copy of copies)
    hints.push(
      `${copy.id} is the mirror of ${copy.mirrorOf!.id}: make changes on ${copy.mirrorOf!.id} and mirror it again, or the two sides drift apart.`,
    );

  return hints;
}
