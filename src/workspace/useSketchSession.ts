import { useRef, useState, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';
import { faceOf, placedPlane, referenceSketch, toPartLocal, type FacePick } from '../utils/sketch/face';
import {
  GROUND_PLANE,
  partFromSolid,
  partPlane,
  sketchSolid,
  type SketchPlane,
  type SketchShape,
  type Vec3,
} from '../utils/sketch/placement';
import { EMPTY_SKETCH, type Sketch } from '../utils/sketch/types';
import type { CommitParts, Setter } from './types';
import type { ToolMode } from './useToolMode';

export interface SketchTarget {
  key: number;
  plane: SketchPlane;
  start: Sketch;
  partId?: string;
}

interface SessionOptions {
  docs: { partsRef: RefObject<ScenePart[]>; commitParts: CommitParts };
  viewportRef: RefObject<Viewport3DHandle | null>;
  selectedIds: string[];
  setSelectedIds: Setter<string[]>;
  tool: ToolMode;
}

interface Pick {
  partId: string;
  pick: FacePick;
}

export function rebuiltPart(part: ScenePart, patch: Partial<SketchShape>): ScenePart {
  const record = part.sketch;

  if (!record) return part;

  const shape: SketchShape = {
    sketch: patch.sketch ?? record.sketch,
    mode: patch.mode ?? record.mode,
    depth: patch.depth ?? record.depth,
  };
  const node = part.customNodes?.[0];
  const solid = sketchSolid(partPlane(part), shape, { id: node?.id ?? part.id, name: part.name, color: part.color });

  return solid ? partFromSolid(part, solid) : { ...part, sketch: { ...record, ...shape } };
}

function faceTarget(part: ScenePart, triangles: Float32Array, { pick }: Pick, key: number): SketchTarget | null {
  const local: FacePick =
    'point' in pick ? { point: toPartLocal(pick.point, part) } : { normal: toPartLocal(pick.normal, part, true) };
  const face = faceOf(triangles, local);

  return face && { key, plane: placedPlane(face.plane, part), start: referenceSketch(face.edges) };
}

export function useSketchSession({ docs, viewportRef, selectedIds, setSelectedIds, tool }: SessionOptions) {
  const { partsRef, commitParts } = docs;
  const lastPick = useRef<Pick | null>(null);
  const [target, setTarget] = useState<SketchTarget | null>(null);

  const part = (id: string) => partsRef.current.find((p) => p.id === id);

  const pickedFace = (key: number) => {
    const picked = lastPick.current;
    const on = picked && selectedIds.length === 1 && selectedIds[0] === picked.partId ? part(picked.partId) : null;
    const triangles = on && viewportRef.current?.partTriangles(on.id);

    return on && triangles && picked ? faceTarget(on, triangles, picked, key) : null;
  };

  const open = () => {
    const key = Date.now();

    setTarget(pickedFace(key) ?? { key, plane: GROUND_PLANE, start: EMPTY_SKETCH });
    tool.openCreator('draw2d');
  };

  const edit = (partId: string) => {
    const record = part(partId)?.sketch;

    if (!record) return;

    setTarget({ key: Date.now(), plane: partPlane(part(partId)!), start: record.sketch, partId });
    tool.openCreator('draw2d');
  };

  return {
    target,
    open,
    edit,
    notePick: (partId: string, point: Vec3) => {
      lastPick.current = { partId, pick: { point } };
    },
    selectFace: (partId: string, normal: Vec3) => {
      lastPick.current = { partId, pick: { normal } };
      setSelectedIds([partId]);
    },
    change: (partId: string, patch: Partial<SketchShape>) =>
      commitParts((prev) => prev.map((p) => (p.id === partId ? rebuiltPart(p, patch) : p))),
  };
}

export type SketchSession = ReturnType<typeof useSketchSession>;
