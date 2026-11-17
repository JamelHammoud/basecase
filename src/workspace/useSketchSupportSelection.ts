import { useRef, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';
import { geometryWorker } from '../three/geometryWorker';
import { findPartDeep } from '../booleans/parts';
import { SUPPORT_LIMITS, supportWorkerPart, validSupport } from '../utils/sketch/support';
import { withinSupportBudget } from '../utils/sketch/supportBudget';
import type { Vec3 } from '../utils/sketch/placement';
import type { CommitParts, ShowToast } from './types';
import type { ToolMode } from './useToolMode';

interface SupportSelection {
  partsRef: RefObject<ScenePart[]>;
  viewportRef: RefObject<Viewport3DHandle | null>;
  commitParts: CommitParts;
  tool: ToolMode;
  showToast: ShowToast;
}

async function captureReplacement(source: ScenePart, triangles: Float32Array, point: Vec3) {
  const input = supportWorkerPart(source);

  if (!withinSupportBudget(input) || triangles.byteLength > SUPPORT_LIMITS.geometryBytes) return null;

  return geometryWorker.call('sketchFace', { part: input, soup: triangles, pick: { point } }).catch(() => null);
}

export function useSketchSupportSelection({ partsRef, viewportRef, commitParts, tool, showToast }: SupportSelection) {
  const selecting = useRef<{ dependent: ScenePart; parts: ScenePart[] } | null>(null);

  const cancelSupport = () => {
    const active = !!selecting.current;

    selecting.current = null;

    return active;
  };

  const pickSupport = async (id: string, point: Vec3) => {
    const request = selecting.current;

    if (!request || request.parts !== partsRef.current) return cancelSupport();

    const { dependent } = request;
    const source = findPartDeep(partsRef.current, id);
    const triangles = source && viewportRef.current?.partTriangles(source.id);

    if (!dependent.sketch || !source || !triangles || dependent.id === source.id) return;

    const captured = await captureReplacement(source, triangles, point);

    if (selecting.current !== request || request.parts !== partsRef.current) return;

    if (!captured?.support) {
      showToast('Select a single rectangular face', { tone: 'error' });

      return;
    }

    selecting.current = null;

    const record = dependent.sketch;
    const support = {
      ...captured.support,
      corners: validSupport(record.support) ? record.support.corners : captured.support.corners,
      fingerprint: 'resolve',
    };

    commitParts((parts) => parts.map((p) => (p.id === dependent.id ? { ...p, sketch: { ...record, support } } : p)));
  };

  return {
    selectSupport: (id: string) => {
      const dependent = findPartDeep(partsRef.current, id);

      if (!dependent?.sketch) return;

      selecting.current = { dependent, parts: partsRef.current };
      tool.setCreator(null);
    },
    cancelSupport,
    pickSupport,
  };
}
