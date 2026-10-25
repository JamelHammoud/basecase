import type { HardwareSpec } from '../data/hardware';
import type { PartTransformUpdate } from '../three/viewport/types';
import type { PartRole, ScenePart, SculptMeshData } from '../types/robotics';
import { alignParts, distributeParts, type AlignMode, type Axis } from '../utils/selection';
import { newId } from './helpers';
import { dropToFloor, moveSelectionTo, rotateQuarterTurn, stackedPosition, withHardware } from './partTransforms';
import type { Vec3 } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';

function applyPatch(p: ScenePart, patch: Partial<ScenePart>): ScenePart {
  const next = { ...p, ...patch };
  const recolored = patch.color !== undefined && patch.color !== p.color;

  return recolored && next.mesh?.visual ? { ...next, mesh: { ...next.mesh, visual: undefined } } : next;
}

const patchWhere =
  (match: (p: ScenePart) => boolean, patch: (p: ScenePart) => Partial<ScenePart>) => (prev: ScenePart[]) =>
    prev.map((p) => (match(p) ? applyPatch(p, patch(p)) : p));

function useGroupEdits({ docs, parts, selectedIds, selection, showToast }: WorkspaceCore) {
  'use memo';

  const { commitParts } = docs;

  const group = () => {
    if (selection.selectedParts.length < 2) return;

    const existing = new Set(parts.map((p) => p.group?.id).filter(Boolean));
    const next = { id: newId('group'), name: `Group ${existing.size + 1}` };
    const ids = new Set(selectedIds);

    commitParts(
      patchWhere(
        (p) => ids.has(p.id),
        () => ({ group: next }),
      ),
    );
    showToast(`Grouped ${ids.size} parts`);
  };

  const ungroup = () => {
    const groupIds = new Set(selection.selectedParts.map((p) => p.group?.id).filter(Boolean));

    if (groupIds.size === 0) return;

    commitParts(
      patchWhere(
        (p) => !!p.group && groupIds.has(p.group.id),
        () => ({ group: undefined }),
      ),
    );
    showToast('Ungrouped');
  };

  const renameGroup = (groupId: string, name: string) =>
    commitParts(
      patchWhere(
        (p) => p.group?.id === groupId,
        () => ({ group: { id: groupId, name } }),
      ),
    );

  return { group, ungroup, renameGroup };
}

function useSelectionMoves({ docs, selectedIds, selection, parts }: WorkspaceCore) {
  'use memo';

  const { commitParts } = docs;

  const updateSelectedPart = (patch: Partial<ScenePart>, live?: boolean) => {
    const id = selection.selectedPartId;

    if (!id) return;

    commitParts(
      patchWhere(
        (p) => p.id === id,
        () => patch,
      ),
      !!live,
    );
  };

  const align = (axis: Axis, mode: AlignMode) => {
    if (selectedIds.length === 0) return;

    commitParts((prev) => alignParts(prev, selectedIds, axis, mode));
  };

  const dropToGround = () => {
    if (selectedIds.length === 0) return;

    const ids = new Set(selectedIds);

    commitParts((prev) => dropToFloor(prev, ids));
  };

  const stackOnBelow = () => {
    const part = selection.selectedPart;

    if (part) updateSelectedPart({ position: stackedPosition(part, parts) });
  };

  return {
    updateSelectedPart,
    align,
    distribute: (axis: Axis) => commitParts((prev) => distributeParts(prev, selectedIds, axis)),
    dropToGround,
    stackOnBelow,
    rotateSelection: (axis: Axis) => commitParts((prev) => rotateQuarterTurn(prev, new Set(selectedIds), axis)),
    moveSelection: (target: Partial<Record<Axis, number>>, live?: boolean) =>
      commitParts((prev) => moveSelectionTo(prev, new Set(selectedIds), target, live), live),
  };
}

export function usePartEdits(core: WorkspaceCore) {
  const { docs, selectedIds, selection } = core;
  const { commitParts } = docs;
  const groups = useGroupEdits(core);
  const moves = useSelectionMoves(core);

  const updatePartTransform = (id: string, position: Vec3, rotation: Vec3, dimensions?: ScenePart['dimensions']) =>
    commitParts(
      patchWhere(
        (p) => p.id === id,
        (p) => ({ position, rotation, dimensions: dimensions || p.dimensions }),
      ),
    );

  const updatePartsTransform = (updates: PartTransformUpdate[]) => {
    const map = new Map(updates.map((u) => [u.id, u]));

    commitParts((prev) =>
      prev.map((p) => {
        const u = map.get(p.id);

        return u ? { ...p, position: u.position, rotation: u.rotation, dimensions: u.dimensions || p.dimensions } : p;
      }),
    );
  };

  const changeHardware = (spec: HardwareSpec, live?: boolean) => {
    const id = selection.selectedPartId;

    if (!id) return;

    commitParts((prev) => prev.map((p) => (p.id === id ? withHardware(p, spec) : p)), live);
  };

  const updateSelectedParts = (patch: Partial<ScenePart>) => {
    const ids = new Set(selectedIds);

    commitParts(
      patchWhere(
        (p) => ids.has(p.id),
        () => patch,
      ),
    );
  };

  return {
    ...groups,
    ...moves,
    updatePartTransform,
    updatePartsTransform,
    commitSculptMesh: (partId: string, sculptMesh: SculptMeshData) =>
      commitParts(
        patchWhere(
          (p) => p.id === partId,
          () => ({ sculptMesh, kind: 'sculpt_mesh' as const }),
        ),
      ),
    changeHardware,
    updateSelectedParts,
    togglePartFlag: (id: string, flag: 'visible' | 'locked') =>
      commitParts(
        patchWhere(
          (p) => p.id === id,
          (p) => ({ [flag]: !p[flag] }),
        ),
      ),
    renamePart: (id: string, name: string) =>
      commitParts(
        patchWhere(
          (p) => p.id === id,
          () => ({ name }),
        ),
      ),
    patchPart: (id: string, patch: Partial<ScenePart>) =>
      commitParts(
        patchWhere(
          (p) => p.id === id,
          () => patch,
        ),
      ),
    setSelectedRoles: (role: PartRole) =>
      commitParts(
        patchWhere(
          (p) => selectedIds.includes(p.id) && p.kind !== 'image_plane',
          () => ({ role }),
        ),
      ),
  };
}

export type PartEdits = ReturnType<typeof usePartEdits>;
