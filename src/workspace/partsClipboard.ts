import { copiedSketchSupports } from '../utils/sketch/supportCopies';
import { freshOperandIds } from '../booleans/parts';
import type { ScenePart, ProjectSettings } from '../types/robotics';
import { newId } from './helpers';
import type { Vec3 } from './types';
import { hasParameterBindings } from '../utils/designParameters/transfers';

export const PARTS_CLIPBOARD_TYPE = 'application/x-basecase-parts';

const PASTE_STEP = 15;

interface PartsClipboard {
  parameters?: ProjectSettings['designParameters'];
  origin: string;
  parts: ScenePart[];
  inPlace: Set<string>;
  pastes: Map<string, number>;
}

const store: { clip: PartsClipboard | null } = { clip: null };

export function copyToClipboard(
  parts: ScenePart[],
  workspaceId: string,
  cut: boolean,
  parameters?: ProjectSettings['designParameters'],
) {
  store.clip = {
    origin: workspaceId,
    parameters,
    parts,
    inPlace: new Set(cut ? [] : [workspaceId]),
    pastes: new Map(),
  };
}

export function takePaste(workspaceId: string, parameters?: ProjectSettings['designParameters']): ScenePart[] | null {
  const clip = store.clip;

  if (!clip) return null;

  if (clip.origin !== workspaceId && hasParameterBindings(clip.parts))
    throw new Error('Unbind shared dimensions before pasting into another scene.');

  if (clip.parameters !== parameters && hasParameterBindings(clip.parts))
    throw new Error('Copy the parts again after changing shared parameters.');

  const n = clip.pastes.get(workspaceId) ?? 0;

  clip.pastes.set(workspaceId, n + 1);

  const step = PASTE_STEP * (n + (clip.inPlace.has(workspaceId) ? 1 : 0));
  const groupMap = new Map<string, { id: string; name: string }>();
  const copyGroup = (group: ScenePart['group']) => {
    if (!group) return group;

    if (!groupMap.has(group.id)) groupMap.set(group.id, { id: newId('group'), name: group.name });

    return groupMap.get(group.id);
  };

  const copies = clip.parts.map(({ jointId: _joint, ...p }) => ({
    ...freshOperandIds(p, () => newId()),
    id: newId(),
    group: copyGroup(p.group),
    position: [p.position[0] + step, p.position[1], p.position[2] + step] as Vec3,
  }));

  return copiedSketchSupports(clip.parts, copies);
}
