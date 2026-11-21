import { SKETCH_SUPPORT_CAUSES } from '../readiness/sketchSupports';
import { useRef, useState, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { linkageParts } from '../linkage/linkageParts';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { LinkageSolution, Vec2 } from '../utils/linkage';
import type { FacePick } from '../utils/sketch/face';
import { geometryWorker } from '../three/geometryWorker';
import { findPartDeep } from '../booleans/parts';
import {
  GROUND_PLANE,
  partFromSolid,
  partPlane,
  sketchSolid,
  type SketchPlane,
  type SketchShape,
  type Vec3,
} from '../utils/sketch/placement';
import { supportWorkerPart, supportFingerprint, SUPPORT_LIMITS } from '../utils/sketch/support';
import { withinSupportBudget } from '../utils/sketch/supportBudget';
import { EMPTY_SKETCH, type Sketch } from '../utils/sketch/types';
import type { SketchSupport } from '../utils/sketch/types';
import { newId } from './helpers';
import type { CommitParts, Setter, ShowToast } from './types';
import type { ToolMode } from './useToolMode';
import { useSketchSupportSelection } from './useSketchSupportSelection';

export interface SketchTarget {
  key: number;
  plane: SketchPlane;
  start: Sketch;
  partId?: string;
  support?: SketchSupport;
}

interface SessionOptions {
  docs: {
    partsRef: RefObject<ScenePart[]>;
    commitParts: CommitParts;
    updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  };
  viewportRef: RefObject<Viewport3DHandle | null>;
  selectedIds: string[];
  setSelectedIds: Setter<string[]>;
  tool: ToolMode;
  showToast: ShowToast;
}

interface Pick {
  partId: string;
  pick: FacePick;
  fingerprint?: string;
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
  const support = record.support && { ...record.support, issue: undefined, attempt: undefined };

  return solid
    ? { ...partFromSolid(part, solid), sketch: { ...solid.record, support } }
    : {
        ...part,
        sketch: {
          ...record,
          ...shape,
          support: support && { ...support, issue: 'profile', attempt: support.fingerprint },
        },
      };
}

function validPickedSource(part: ScenePart, pick: Pick, showToast: ShowToast) {
  const fingerprint = supportFingerprint(part);
  const message = fingerprint === 'limit' ? SKETCH_SUPPORT_CAUSES.limit : null;

  if (message) {
    showToast(message, { tone: 'error' });

    return false;
  }

  if (pick.fingerprint === fingerprint) return true;

  showToast('Select the face again', { tone: 'error' });

  return false;
}

export function useSketchSession({ docs, viewportRef, selectedIds, setSelectedIds, tool, showToast }: SessionOptions) {
  const { partsRef, commitParts } = docs;
  const lastPick = useRef<Pick | null>(null);
  const [target, setTarget] = useState<SketchTarget | null>(null);
  const [path, setPath] = useState<Vec2[]>([]);
  const supportSelection = useSketchSupportSelection({ partsRef, viewportRef, commitParts, tool, showToast });

  const part = (id: string) => findPartDeep(partsRef.current, id);

  const request = useRef(0);

  const pickedFace = async (key: number) => {
    const picked = lastPick.current;
    const on = picked && selectedIds.length === 1 && selectedIds[0] === picked.partId ? part(picked.partId) : null;

    if (!on || !picked) return null;

    if (!validPickedSource(on, picked, showToast)) return undefined;

    const triangles = viewportRef.current?.partTriangles(on.id);

    if (!triangles) return undefined;

    const input = supportWorkerPart(on);

    if (!withinSupportBudget(input) || triangles.byteLength > SUPPORT_LIMITS.geometryBytes) {
      showToast(SKETCH_SUPPORT_CAUSES.limit, { tone: 'error' });

      return undefined;
    }

    const face = await geometryWorker
      .call('sketchFace', { part: input, soup: triangles, pick: picked.pick })
      .catch(() => null);

    return face && part(on.id) === on ? { key, plane: face.plane, start: face.reference, support: face.support } : null;
  };

  const open = async () => {
    const key = ++request.current;
    const before = partsRef.current;
    const picked = await pickedFace(key);

    if (picked === undefined || request.current !== key || partsRef.current !== before) return;

    if (picked && !picked.support) {
      showToast('Select a single rectangular face', { tone: 'error' });

      return;
    }

    setTarget(picked ?? { key, plane: GROUND_PLANE, start: EMPTY_SKETCH });
    setPath([]);
    tool.openCreator('draw2d');
  };

  const edit = (partId: string) => {
    const record = part(partId)?.sketch;

    if (!record) return;

    setTarget({ key: Date.now(), plane: partPlane(part(partId)!), start: record.sketch, partId });
    tool.openCreator('draw2d');
  };

  const insertLinkage = (solution: LinkageSolution) => {
    const built = linkageParts(solution, target?.plane ?? GROUND_PLANE, newId('linkage'));

    commitParts((prev) => [...prev, ...built.parts]);
    docs.updateProjectNow((p) => ({ ...p, joints: [...(p.joints ?? []), ...built.joints] }));
    setSelectedIds(built.parts.map((p) => p.id));
    setPath([]);
    tool.setCreator(null);
  };

  return {
    target,
    open,
    edit,
    path,
    setPath,
    insertLinkage,
    selectSupport: supportSelection.selectSupport,
    cancelSupport: supportSelection.cancelSupport,
    notePick: (partId: string, point: Vec3) => {
      lastPick.current = {
        partId,
        pick: { point },
        fingerprint: part(partId) ? supportFingerprint(part(partId)!) : undefined,
      };
      supportSelection.pickSupport(partId, point);
    },
    selectFace: (partId: string, normal: Vec3) => {
      lastPick.current = {
        partId,
        pick: { normal },
        fingerprint: part(partId) ? supportFingerprint(part(partId)!) : undefined,
      };
      setSelectedIds([partId]);
    },
    change: (partId: string, patch: Partial<SketchShape>) =>
      commitParts((prev) => prev.map((p) => (p.id === partId ? rebuiltPart(p, patch) : p))),
  };
}

export type SketchSession = ReturnType<typeof useSketchSession>;
