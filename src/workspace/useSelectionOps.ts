import { buildPartGroup } from '../three/buildPartMesh';
import { runSceneBooleanCSG } from '../three/sculptAndBooleanEngine';
import type { ScenePart } from '../types/robotics';
import { hardwareCutoutParts } from '../utils/hardwareCutouts';
import { boundsOverlap } from '../utils/selection';
import { newId, partLabel } from './helpers';
import type { Vec3 } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';

export type BooleanOp = 'subtract' | 'union' | 'intersect';

const BOOLEAN_DONE: Record<BooleanOp, string> = { subtract: 'Subtracted', union: 'Merged', intersect: 'Intersected' };

const DUPLICATE_STEP = 15;

export function duplicateParts(parts: ScenePart[]): ScenePart[] {
  const groupMap = new Map<string, { id: string; name: string }>();
  const copyGroup = (group: ScenePart['group']) => {
    if (!group) return group;

    if (!groupMap.has(group.id)) groupMap.set(group.id, { id: newId('group'), name: `${group.name} Copy` });

    return groupMap.get(group.id);
  };

  return parts.map((p) => ({
    ...p,
    id: newId(),
    name: parts.length === 1 ? `${p.name} Copy` : p.name,
    group: copyGroup(p.group),
    position: [p.position[0] + DUPLICATE_STEP, p.position[1], p.position[2] + DUPLICATE_STEP] as Vec3,
  }));
}

export function clearanceCutouts(sources: ScenePart[]): ScenePart[] {
  return sources.flatMap((p) => {
    const cutouts = hardwareCutoutParts(p, () => newId('cut'));

    if (cutouts.length < 2) return cutouts;

    const group = { id: newId('group'), name: `${p.name} Holes` };

    return cutouts.map((c) => ({ ...c, group }));
  });
}

function booleanOperands(base: ScenePart, solids: ScenePart[], op: BooleanOp, parts: ScenePart[]) {
  const operands = solids.slice(1);

  if (operands.length > 0) return { operands };

  if (op !== 'subtract') return { error: 'Shift-click another part to combine' };

  const cutouts = parts.filter((p) => p.id !== base.id && p.visible && p.role === 'cutout' && boundsOverlap(base, p));

  return cutouts.length
    ? { operands: cutouts }
    : { error: 'Nothing to subtract. Overlap a Cutout or Shift-click a part.' };
}

export function useSelectionOps({ docs, parts, selection, setSelectedIds, showToast, undo }: WorkspaceCore) {
  'use memo';

  const { commitParts } = docs;
  const { selectedParts } = selection;
  const undoAction = { label: 'Undo', onClick: undo };

  const removeSelected = (verb: 'Deleted' | 'Cut') => {
    const ids = selectedParts.map((p) => p.id);

    commitParts((prev) => prev.filter((p) => !ids.includes(p.id)));
    setSelectedIds([]);
    showToast(`${verb} ${partLabel(selectedParts)}`, {
      tone: 'neutral',
      action: {
        label: 'Undo',
        onClick: () => {
          undo();
          setSelectedIds(ids);
        },
      },
    });
  };

  const duplicateSelected = () => {
    if (selectedParts.length === 0) return;

    const copies = duplicateParts(selectedParts);

    commitParts((prev) => [...prev, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  };

  const deleteSelected = () => {
    if (selectedParts.length > 0) removeSelected('Deleted');
  };

  const runBoolean = (op: BooleanOp) => {
    const solids = selectedParts.filter((p) => p.kind !== 'image_plane');
    const base = solids[0];

    if (!base) {
      showToast('Select a part first', { tone: 'error' });

      return;
    }

    const { operands, error } = booleanOperands(base, solids, op, parts);

    if (!operands) {
      showToast(error, { tone: 'error' });

      return;
    }

    const res = runSceneBooleanCSG(base, operands, op, (p) => buildPartGroup(p, false));

    if (!res) {
      showToast('Those parts don’t overlap', { tone: 'error' });

      return;
    }

    const sameGroup = operands.every((o) => o.group?.id === base.group?.id) ? base.group : undefined;
    const result: ScenePart = {
      ...res,
      name: op === 'subtract' ? base.name : `${base.name} ${op === 'union' ? 'Union' : 'Intersect'}`,
      group: sameGroup,
    };
    const operandIds = new Set(operands.map((o) => o.id));

    commitParts((prev) => prev.filter((p) => !operandIds.has(p.id)).map((p) => (p.id === base.id ? result : p)));
    setSelectedIds([result.id]);
    showToast(BOOLEAN_DONE[op], { action: undoAction });
  };

  const addClearanceHole = () => {
    const sources = selectedParts.filter((p) => p.hardware);

    if (sources.length === 0) return;

    const created = clearanceCutouts(sources);

    if (created.length === 0) {
      showToast('No hole needed for this part', { tone: 'neutral' });

      return;
    }

    commitParts((prev) => [...prev, ...created]);
    setSelectedIds(created.map((c) => c.id));
    showToast(created.length === 1 ? `Added ${created[0].name}` : `Added ${created.length} cutouts`, {
      action: undoAction,
    });
  };

  return { duplicateSelected, deleteSelected, cutSelected: () => removeSelected('Cut'), runBoolean, addClearanceHole };
}

export type SelectionOps = ReturnType<typeof useSelectionOps>;
