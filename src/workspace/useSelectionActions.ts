import type { ScenePart, TransformMode } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { expandToGroups } from '../utils/selection';
import { selectableIds } from './helpers';
import { addIds, clickSelection, poseClickSelection } from './selection';
import type { Setter } from './types';

interface SelectionOptions {
  parts: ScenePart[];
  selectedIds: string[];
  setSelectedIds: Setter<string[]>;
  transformMode: TransformMode;
  rig: Rig;
  showReferenceImages: boolean;
}

export function useSelectionActions({
  parts,
  selectedIds,
  setSelectedIds,
  transformMode,
  rig,
  showReferenceImages,
}: SelectionOptions) {
  'use memo';

  const select = (id: string | null, additive = false, drill = false) => {
    if (!id && !additive) setSelectedIds([]);

    if (!id) return;

    if (transformMode === 'pose' && !additive) {
      setSelectedIds(poseClickSelection(rig, id, selectedIds, parts));

      return;
    }

    const part = parts.find((p) => p.id === id);
    const unit = part?.group ? expandToGroups(parts, [id]) : [id];

    setSelectedIds((prev) => clickSelection(prev, id, unit, { additive, drill }));
  };

  const selectAll = () => setSelectedIds(selectableIds(parts, showReferenceImages));

  const selectIds = (ids: string[], additive?: boolean) =>
    setSelectedIds((prev) => (additive ? addIds(prev, ids) : ids));

  const marqueeSelect = (ids: string[]) => {
    if (ids.length === 0) return;

    const withGroups = expandToGroups(parts, ids);

    setSelectedIds((prev) => addIds(prev, withGroups));
  };

  const selectedParts = selectedIds.map((id) => parts.find((p) => p.id === id)).filter((p): p is ScenePart => !!p);
  const selectedPartId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedPart = parts.find((p) => p.id === selectedPartId) || null;

  return { select, selectAll, selectIds, marqueeSelect, selectedParts, selectedPartId, selectedPart };
}

export type SelectionActions = ReturnType<typeof useSelectionActions>;
