import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { RoundFace } from '../joints/axisFinder';
import type { SceneAxis } from '../joints/declareJoints';
import { addHandJoint, HINGE_RANGE, withJointRange, withoutJoint, type HandJointType } from '../joints/handJoint';
import type { PlacedSoup } from '../joints/placeJoint';
import { geometryWorker } from '../three/geometryWorker';
import type { ScenePart } from '../types/robotics';
import { prettyJointName } from '../utils/kinematics';
import { partMatrix } from '../utils/kinematicsMotion';
import type { Vec3 } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';

interface Pick {
  type: HandJointType;
  parent: string;
  child: string;
}

interface Picking extends Pick {
  context: string;
}

const SLIDE_FALLBACK: [number, number] = [-50, 50];

function worldAxis(face: RoundFace, part: ScenePart): SceneAxis {
  const m = partMatrix(part);

  return {
    origin: new THREE.Vector3(...face.origin).applyMatrix4(m).toArray() as Vec3,
    axis: new THREE.Vector3(...face.axis).transformDirection(m).toArray() as Vec3,
  };
}

function pickContext(core: WorkspaceCore, active: boolean): string {
  const { tool, annotations, selectedIds } = core;

  return JSON.stringify([
    active,
    selectedIds,
    tool.transformMode,
    tool.measuring,
    tool.marking,
    annotations.commentMode,
    tool.leftTab,
    tool.rightTab,
  ]);
}

export function useHandJoints(core: WorkspaceCore, active: boolean) {
  const { docs, viewportRef, setSelectedIds, tool, posing, showToast, undo } = core;
  const { partsRef, projectRef, commitJointEdit } = docs;
  const [picking, setPicking] = useState<Picking | null>(null);
  const busyRef = useRef(false);
  const canJoin = core.selectedIds.length === 2;
  const context = pickContext(core, active);
  const nowRef = useRef({ picking, context });

  if (picking && picking.context !== context) setPicking(null);

  useEffect(() => {
    nowRef.current = { picking, context };
  }, [picking, context]);

  const placedSoup = (id: string): PlacedSoup | null => {
    const part = partsRef.current.find((p) => p.id === id);
    const soup = part && viewportRef.current?.partTriangles(id);

    return part && soup ? { soup, matrix: partMatrix(part).elements } : null;
  };

  const placement = async (pick: Pick, at?: SceneAxis) => {
    const parent = placedSoup(pick.parent);
    const child = placedSoup(pick.child);
    const slide = pick.type === 'prismatic';

    if (!parent || !child) return at ? { at, travel: null } : null;

    return geometryWorker.call('placeJoint', { parent, child, at, slide }, [parent.soup.buffer, child.soup.buffer]);
  };

  const place = (pick: Pick, { at, travel }: { at: SceneAxis; travel: [number, number] | null }) => {
    const range = pick.type === 'revolute' ? HINGE_RANGE : (travel ?? SLIDE_FALLBACK);
    const made = addHandJoint({ ...pick, at, range }, partsRef.current, projectRef.current);

    if (typeof made === 'string') return;

    commitJointEdit(() => made.next);
    setSelectedIds([pick.child]);
    tool.setMode('pose');
    posing.selectJoint(made.joint.id);
  };

  const start = async (type: HandJointType) => {
    const [parent, child] = core.selectedIds;

    if (!canJoin) return;

    const pick = { type, parent, child };
    const shared = await placement(pick);

    if (nowRef.current.context !== context) return;

    if (shared) place(pick, shared);
    else setPicking({ ...pick, context });
  };

  const faceAt = async (clientX: number, clientY: number) => {
    const hit = viewportRef.current?.pickAt(clientX, clientY);
    const part = hit?.partId ? partsRef.current.find((p) => p.id === hit.partId) : undefined;
    const local = part && viewportRef.current?.partTriangles(part.id);

    if (!part || !local || !hit?.local) return null;

    const face = await geometryWorker.call('roundFace', { soup: local, point: hit.local }, [local.buffer]);

    return face && worldAxis(face, part);
  };

  const pickAxis = async (clientX: number, clientY: number) => {
    if (!picking || busyRef.current) return;

    busyRef.current = true;

    const placed = await faceAt(clientX, clientY)
      .then((at) => at && placement(picking, at))
      .finally(() => {
        busyRef.current = false;
      });

    if (!placed || nowRef.current.picking !== picking) return;

    setPicking(null);
    place(picking, placed);
  };

  const remove = (id: string) => {
    const joint = projectRef.current.joints?.find((j) => j.id === id);

    if (!joint) return;

    commitJointEdit((p) => withoutJoint(p, id));
    showToast(`Deleted ${prettyJointName(joint.name)}`, { tone: 'neutral', action: { label: 'Undo', onClick: undo } });
  };

  return {
    canJoin,
    picking: picking !== null,
    start: (type: HandJointType) => void start(type),
    pickAxis: (clientX: number, clientY: number) => void pickAxis(clientX, clientY),
    cancel: () => setPicking(null),
    remove,
    setRange: (id: string, range: [number, number], live?: boolean) =>
      commitJointEdit((p) => withJointRange(p, id, range), live),
  };
}

export type HandJoints = ReturnType<typeof useHandJoints>;
