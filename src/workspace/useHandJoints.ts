import { useRef, useState } from 'react';
import type { FoundAxis } from '../joints/axisFinder';
import { handJoint, withJoints, withoutJoint, withRange, type HandJointType } from '../joints/declare';
import type { AxisPickHit } from '../three/viewport/types';
import type { ScenePart } from '../types/robotics';
import { useLatestRef } from '../utils/useLatestRef';
import type { WorkspaceCore } from './useWorkspaceCore';

interface Pick {
  type: HandJointType;
  parent: string;
  child: string;
  ready: boolean;
}

const joinable = (part: ScenePart | undefined): part is ScenePart => !!part && part.kind !== 'image_plane';

function useHoverQueue(ask: (hit: AxisPickHit) => Promise<boolean>, setReady: (ready: boolean) => void) {
  const queue = useRef<{ busy: boolean; next: AxisPickHit | null | undefined }>({ busy: false, next: undefined });

  const drain = async () => {
    const q = queue.current;

    while (q.next !== undefined) {
      const hit = q.next;

      q.next = undefined;
      setReady(hit ? await ask(hit) : false);
    }

    q.busy = false;
  };

  return (hit: AxisPickHit | null) => {
    const q = queue.current;

    q.next = hit;

    if (q.busy) return;

    q.busy = true;
    void drain();
  };
}

export function useHandJoints(core: WorkspaceCore) {
  const { docs, parts, selectedIds, setSelectedIds, viewportRef, posing, tool, showToast, undo } = core;
  const [pick, setPick] = useState<Pick | null>(null);
  const selectedRef = useLatestRef(selectedIds);
  const [parent, child] = selectedIds.map((id) => parts.find((p) => p.id === id));
  const canJoin = selectedIds.length === 2 && joinable(parent) && joinable(child);
  const picking = pick && pick.parent === selectedIds[0] && pick.child === selectedIds[1] ? pick : null;
  const stillSelected = (p: { parent: string; child: string }) =>
    selectedRef.current.length === 2 && selectedRef.current[0] === p.parent && selectedRef.current[1] === p.child;

  const create = (type: HandJointType, ids: { parent: string; child: string }, found: FoundAxis) => {
    const all = docs.partsRef.current;
    const sides = [ids.parent, ids.child].map((id) => all.find((p) => p.id === id));

    if (!joinable(sides[0]) || !joinable(sides[1])) return;

    const joint = handJoint({
      type,
      parent: sides[0],
      child: sides[1],
      found,
      parts: all,
      joints: docs.projectRef.current.joints ?? [],
    });

    docs.commitJoints((p) => withJoints(p, [joint]));
    setPick(null);
    setSelectedIds([ids.child]);
    posing.selectJoint(joint.id);
    tool.setMode('pose');
  };

  const axisFor = (ids: { parent: string; child: string }, hit?: AxisPickHit) =>
    viewportRef.current?.jointAxis({ ...ids, pick: hit }) ?? Promise.resolve(null);

  const start = async (type: HandJointType) => {
    if (!canJoin) return;

    const ids = { parent: parent.id, child: child.id };
    const found = await axisFor(ids);

    if (!stillSelected(ids)) return;

    if (found) create(type, ids, found);
    else setPick({ type, ...ids, ready: false });
  };

  const hover = useHoverQueue(
    async (hit) => !!picking && !!(await axisFor(picking, hit)),
    (ready) => setPick((p) => (p && p.ready !== ready ? { ...p, ready } : p)),
  );

  const choose = async (hit: AxisPickHit) => {
    if (!picking) return;

    const found = await axisFor(picking, hit);

    if (found && stillSelected(picking)) create(picking.type, picking, found);
  };

  const onAxisPick = (hit: AxisPickHit | null, click: boolean) => {
    if (click && hit) void choose(hit);
    else if (!click) hover(hit);
  };

  const remove = (id: string) => {
    const joint = docs.projectRef.current.joints?.find((j) => j.id === id);

    if (!joint) return;

    docs.commitJoints((p) => ({ ...p, joints: withoutJoint(p.joints ?? [], id) }));
    showToast(`Deleted ${joint.name}`, { tone: 'neutral', action: { label: 'Undo', onClick: undo } });
  };

  const setRange = (id: string, range: [number, number], live?: boolean) =>
    docs.commitJoints((p) => ({ ...p, joints: withRange(p.joints ?? [], id, range) }), live);

  return {
    canJoin,
    picking,
    start,
    cancel: () => setPick(null),
    onAxisPick,
    remove,
    setRange,
  };
}

export type HandJoints = ReturnType<typeof useHandJoints>;
