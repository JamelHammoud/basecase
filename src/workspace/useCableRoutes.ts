import type { ReadinessFinding } from '../readiness/types';
import { useState } from 'react';
import type { PortVec } from '../types/ports';
import type { Posing } from '../utils/usePosing';
import { errorMessage } from '../utils/errorMessage';
import {
  anchorFromWorld,
  editableNets,
  findEditableNet,
  routeIdentity,
  updateRoute,
  type RouteIdentity,
  type RoutePatch,
  type RouteAnchor,
} from '../wiring/routeEditing';
import { indexRouteSpecs } from '../wiring/routeSpecs';
import type { SceneDocument } from './useSceneDocument';
import type { ShowToast } from './types';
import type { TransformMode } from '../types/robotics';
import type { RightTab } from './types';

interface Options {
  docs: SceneDocument;
  sceneId: string;
  posing: Posing;
  showToast: ShowToast;
  ui: {
    tool: { setMode: (mode: TransformMode) => void; openRightTab: (tab: RightTab) => void };
    select: (ids: string[]) => void;
    buildAlong: { close: () => void };
    sketching: { cancelSupport: () => void };
  };
}

export function useCableRoutes({ docs, sceneId, posing, showToast, ui }: Options) {
  const [selection, setSelection] = useState<{ sceneId: string; identity: RouteIdentity } | null>(null);
  const [placing, setPlacing] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ wiring: typeof docs.project.wiring; base: typeof docs.project } | null>(
    null,
  );
  const scene = { parts: docs.parts, project: docs.project };
  const identity = selection?.sceneId === sceneId ? selection.identity : null;
  const net = identity && findEditableNet(scene, identity);
  const project = preview?.base === docs.project ? { ...docs.project, wiring: preview.wiring } : docs.project;
  const spec = net ? indexRouteSpecs(project.wiring)(net) : undefined;
  const anchors = spec?.anchors ?? [];

  const close = () => {
    setSelection(null);
    setPlacing(null);
    setPreview(null);
  };
  const patch = (change: RoutePatch, live = false) => {
    if (!identity || !net) return;

    try {
      const next = updateRoute({ parts: docs.partsRef.current, project: docs.projectRef.current }, identity, change);

      if (next.wiring === docs.projectRef.current.wiring) {
        setPreview(null);

        return;
      }

      if (live) setPreview({ wiring: next.wiring, base: docs.project });
      else {
        docs.commitWiring(next.wiring);
        setPreview(null);
      }
    } catch (error) {
      showToast(errorMessage(error), { tone: 'error' });
    }
  };
  const changeAnchor = (index: number, anchor: RouteAnchor, live = false) =>
    patch({ anchors: anchors.map((entry, i) => (i === index ? anchor : entry)) }, live);
  const pick = (partId: string, point: PortVec) => {
    const part = docs.partsRef.current.find((entry) => entry.id === partId);

    if (placing === null || !part) return;

    changeAnchor(placing, anchorFromWorld(part, point, posing.deltas.get(partId)));
    setPlacing(null);
  };

  const open = (route: RouteIdentity) => {
    if (!findEditableNet({ parts: docs.partsRef.current, project: docs.projectRef.current }, route)) return;

    ui.buildAlong.close();
    ui.sketching.cancelSupport();
    ui.tool.setMode('translate');
    ui.tool.openRightTab('build');
    ui.select([route.from.partId, route.to.partId]);
    setSelection({ sceneId, identity: route });
    setPreview(null);
    setPlacing(null);
  };

  return {
    openFinding: (finding: ReadinessFinding) => {
      if (finding.fix?.kind === 'cable-route') open(finding.fix.route);
    },
    cancelPreview: () => setPreview(null),
    net: net || null,
    spec,
    anchors,
    placing: net ? placing : null,
    previewing: preview?.base === docs.project,
    nets: editableNets(scene),
    open,
    close,
    patch,
    changeAnchor,
    pick,
    place: setPlacing,
    add: () => {
      if (!net) return;

      patch({ anchors: [...anchors, { partId: net.from.id!, position: [0, 0, 0] }] });
    },
    remove: (index: number) => {
      patch({ anchors: anchors.filter((_, i) => i !== index) });
      setPlacing(null);
    },
    reorder: (index: number, offset: number) => {
      const ordered = [...anchors];
      const target = index + offset;

      if (target < 0 || target >= ordered.length) return;

      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      patch({ anchors: ordered });
      setPlacing(null);
    },
    showPose: (values: Record<string, number>) => {
      if (!net) return;

      close();
      ui.select([net.from.id!, net.to.id!]);
      posing.setPose({ ...posing.pose, values });
      ui.tool.setMode('pose');
    },
    identity: net && routeIdentity(net),
  };
}

export type CableRoutes = ReturnType<typeof useCableRoutes>;
