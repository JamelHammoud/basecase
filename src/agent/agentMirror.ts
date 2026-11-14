import type { ScenePart } from '../types/robotics';
import { mirroredName, SIDE_WORDS, swapWords } from '../mirror/mirrorNames';
import { mirrorPart } from '../mirror/mirrorPart';
import { groupFor, MIRROR_AXIS_INDEX } from './agentFrame';

type MirrorAxis = 'x' | 'y' | 'z';

function twinId(parts: ScenePart[], src: ScenePart, axis: MirrorAxis, rename: Record<string, string>): string {
  if (rename[src.id]) return rename[src.id];

  const twin = parts.find((p) => p.mirrorOf?.id === src.id && p.mirrorOf.axis === axis);

  if (twin) return twin.id;

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
  const plane = { axis: MIRROR_AXIS_INDEX[axis], offset: 0 };
  const used = new Set<string>(ids);

  return ids.flatMap((id) => {
    const src = parts.find((p) => p.id === id);

    if (!src) return [];

    let newId = twinId(parts, src, axis, rename);

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
