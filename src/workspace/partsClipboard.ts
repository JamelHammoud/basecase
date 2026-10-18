import type { ScenePart } from '../types/robotics';
import { newId } from './helpers';
import type { Vec3 } from './types';

export const PARTS_CLIPBOARD_TYPE = 'application/x-basecase-parts';

const PASTE_STEP = 15;

interface PartsClipboard {
  parts: ScenePart[];
  inPlace: Set<string>;
  pastes: Map<string, number>;
}

const store: { clip: PartsClipboard | null } = { clip: null };

export function copyToClipboard(parts: ScenePart[], workspaceId: string, cut: boolean) {
  store.clip = { parts, inPlace: new Set(cut ? [] : [workspaceId]), pastes: new Map() };
}

export function takePaste(workspaceId: string): ScenePart[] | null {
  const clip = store.clip;

  if (!clip) return null;

  const n = clip.pastes.get(workspaceId) ?? 0;

  clip.pastes.set(workspaceId, n + 1);

  const step = PASTE_STEP * (n + (clip.inPlace.has(workspaceId) ? 1 : 0));
  const groupMap = new Map<string, { id: string; name: string }>();
  const copyGroup = (group: ScenePart['group']) => {
    if (!group) return group;

    if (!groupMap.has(group.id)) groupMap.set(group.id, { id: newId('group'), name: group.name });

    return groupMap.get(group.id);
  };

  return clip.parts.map(({ jointId: _joint, ...p }) => ({
    ...p,
    id: newId(),
    group: copyGroup(p.group),
    position: [p.position[0] + step, p.position[1], p.position[2] + step] as Vec3,
  }));
}
