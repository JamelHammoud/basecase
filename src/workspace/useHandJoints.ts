import { useRef, useState } from 'react';
import * as THREE from 'three';
import { slideTravel, type RoundFace } from '../joints/axisFinder';
import type { SceneAxis } from '../joints/declareJoints';
import { addHandJoint, HINGE_RANGE, withJointRange, withoutJoint, type HandJointType } from '../joints/handJoint';
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

function worldSoup(local: Float32Array, part: ScenePart): Float32Array {
  const m = partMatrix(part);
  const v = new THREE.Vector3();
  const out = new Float32Array(local.length);

  for (let i = 0; i < local.length; i += 3) v.fromArray(local, i).applyMatrix4(m).toArray(out, i);

  return out;
}

function worldAxis(face: RoundFace, part: ScenePart): SceneAxis {
  const m = partMatrix(part);

  return {
    origin: new THREE.Vector3(...face.origin).applyMatrix4(m).toArray() as Vec3,
    axis: new THREE.Vector3(...face.axis).transformDirection(m).toArray() as Vec3,
  };
}

export function useHandJoints(core: WorkspaceCore) {
  const { docs, viewportRef, setSelectedIds, tool, posing, showToast, undo } = core;
  const { partsRef, projectRef, commitJointEdit } = docs;
  const [picking, setPicking] = useState<Pick | null>(null);
  const busyRef = useRef(false);
  const canJoin = core.selectedIds.length === 2;

  const soupOf = (id: string) => {
    const part = partsRef.current.find((p) => p.id === id);
    const local = part && viewportRef.current?.partTriangles(id);

    return part && local ? worldSoup(local, part) : null;
  };

  const rangeFor = (pick: Pick, at: SceneAxis): [number, number] => {
    if (pick.type === 'revolute') return HINGE_RANGE;

    const parent = soupOf(pick.parent);
    const child = soupOf(pick.child);

    return parent && child ? slideTravel(parent, child, at) : [-50, 50];
  };

  const place = (pick: Pick, at: SceneAxis) => {
    const made = addHandJoint({ ...pick, at, range: rangeFor(pick, at) }, partsRef.current, projectRef.current);

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
    const a = soupOf(parent);
    const b = soupOf(child);
    const shared =
      a && b ? await geometryWorker.call('sharedAxis', { parent: a, child: b }, [a.buffer, b.buffer]) : null;

    if (shared) place(pick, shared);
    else setPicking(pick);
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

    const at = await faceAt(clientX, clientY).finally(() => {
      busyRef.current = false;
    });

    if (!at) return;

    setPicking(null);
    place(picking, at);
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
