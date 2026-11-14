import { evaluateBoolean } from '../booleans/evaluate';
import { booleanHash } from '../booleans/hash';
import { booleanPart, findPartDeep, freshOperandIds, withResult } from '../booleans/parts';
import type { BooleanOp, ScenePart } from '../types/robotics';
import { hardwareCutoutParts, makesClearanceHole } from '../utils/hardwareCutouts';
import { boundsOverlap } from '../utils/selection';
import { copyName, newId, partLabel } from './helpers';
import type { Vec3 } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';
import { plural } from '../../electron/plural.mjs';

export type { BooleanOp } from '../types/robotics';

export function booleanDone(op: BooleanOp, base: ScenePart, tools: ScenePart[]): string {
  const others = partLabel(tools);

  if (op === 'subtract') return `Subtracted ${others} from ${base.name}`;

  return op === 'union' ? `Merged ${others} into ${base.name}` : `Intersected ${base.name} with ${others}`;
}

const DUPLICATE_STEP = 15;

export function duplicateParts(parts: ScenePart[], scene: ScenePart[]): ScenePart[] {
  const groupNames = scene.flatMap((p) => (p.group ? [p.group.name] : []));
  const groupMap = new Map<string, { id: string; name: string }>();
  const copyGroup = (group: ScenePart['group']) => {
    if (!group) return group;

    if (!groupMap.has(group.id)) groupMap.set(group.id, { id: newId('group'), name: copyName(group.name, groupNames) });

    return groupMap.get(group.id);
  };
  const partNames = scene.map((p) => p.name);
  const partName = (p: ScenePart) => (parts.length === 1 ? copyName(p.name, partNames) : p.name);

  return parts.map((p) => ({
    ...freshOperandIds(p, () => newId()),
    id: newId(),
    name: partName(p),
    group: copyGroup(p.group),
    position: [p.position[0] + DUPLICATE_STEP, p.position[1], p.position[2] + DUPLICATE_STEP] as Vec3,
    mates: undefined,
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

export const unchangedSince = (parts: ScenePart[], used: ScenePart[]) =>
  used.every((p) => findPartDeep(parts, p.id) === p);

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

    const copies = duplicateParts(selectedParts, parts);

    commitParts((prev) => [...prev, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  };

  const deleteSelected = () => {
    if (selectedParts.length === 0) return;

    removeSelected('Deleted');
  };

  const combine = async (op: BooleanOp) => {
    const solids = selectedParts.filter((p) => p.kind !== 'image_plane');
    const base = solids[0];

    if (!base) return;

    const { operands: tools, error } = booleanOperands(base, solids, op, parts);

    if (!tools) {
      showToast(error, { tone: 'error' });

      return;
    }

    const draft = booleanPart({ id: base.id, base: { ...base, id: newId() }, tools, op });
    const evaluated = await evaluateBoolean(draft);

    if (!evaluated) {
      showToast('Those parts don’t overlap', { tone: 'error' });

      return;
    }

    if (!unchangedSince(docs.partsRef.current, [base, ...tools])) return;

    const result = withResult(draft, booleanHash(draft), evaluated);
    const toolIds = new Set(tools.map((o) => o.id));

    commitParts((prev) => prev.filter((p) => !toolIds.has(p.id)).map((p) => (p.id === base.id ? result : p)));
    setSelectedIds([result.id]);
    showToast(booleanDone(op, base, tools), { action: undoAction });
  };

  const runBoolean = (op: BooleanOp) => {
    void combine(op);
  };

  const addClearanceHole = () => {
    const sources = selectedParts.filter(makesClearanceHole);

    if (sources.length === 0) return;

    const created = clearanceCutouts(sources);

    commitParts((prev) => [...prev, ...created]);
    setSelectedIds(created.map((c) => c.id));
    showToast(created.length === 1 ? `Added ${created[0].name}` : `Added ${plural(created.length, 'cutout')}`, {
      action: undoAction,
    });
  };

  return { duplicateSelected, deleteSelected, cutSelected: () => removeSelected('Cut'), runBoolean, addClearanceHole };
}

export type SelectionOps = ReturnType<typeof useSelectionOps>;
