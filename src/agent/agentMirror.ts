import type { ScenePart } from '../types/robotics';
import { mirroredName, SIDE_WORDS, swapWords } from '../mirror/mirrorNames';
import { mirrorPart } from '../mirror/mirrorPart';
import { groupFor, MIRROR_AXIS_INDEX } from './agentFrame';

type MirrorAxis = 'x' | 'y' | 'z';

function mirrorIndex(parts: ScenePart[], axis: MirrorAxis) {
  const sources = new Map<string, ScenePart>();
  const twins = new Map<string, string>();

  for (const part of parts) {
    if (!sources.has(part.id)) sources.set(part.id, part);

    const link = part.mirrorOf;

    if (link?.axis === axis && !twins.has(link.id)) twins.set(link.id, part.id);
  }

  return { sources, twins };
}

function twinId(twins: Map<string, string>, src: ScenePart, axis: MirrorAxis, rename: Record<string, string>): string {
  if (rename[src.id]) return rename[src.id];

  const twin = twins.get(src.id);

  if (twin !== undefined) return twin;

  const swapped = swapWords(src.id, SIDE_WORDS[axis]);

  return swapped === src.id ? `${src.id}-mirror` : swapped;
}

function unlinked(src: ScenePart): ScenePart {
  const copy = { ...src };

  delete copy.jointId;
  delete copy.mates;

  return copy;
}

export function mirrorParts(
  parts: ScenePart[],
  ids: string[],
  axis: MirrorAxis,
  rename: Record<string, string>,
): ScenePart[] {
  if (!ids.length) return [];

  const plane = { axis: MIRROR_AXIS_INDEX[axis], offset: 0 };
  const used = new Set<string>(ids);
  const { sources, twins } = mirrorIndex(parts, axis);

  return ids.flatMap((id) => {
    const src = sources.get(id);

    if (!src) return [];

    let newId = twinId(twins, src, axis, rename);

    while (used.has(newId)) newId = `${newId}-mirror`;

    used.add(newId);

    return [
      {
        ...unlinked(mirrorPart(src, plane)),
        id: newId,
        name: mirroredName(src.name, axis),
        group: src.group ? groupFor(swapWords(src.group.name, SIDE_WORDS[axis])) : undefined,
        mirrorOf: { id: src.id, axis },
      },
    ];
  });
}
