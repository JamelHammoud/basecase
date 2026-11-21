import { knownPurchases } from '../components/build/usePurchases';
import { platformBridge } from '../utils/platformBridge';
import { boughtKey } from '../utils/bom';
import { drawingsClient } from '../sheet/drawingsClient';
import type { DrawingOptions } from '../sheet/drawingTypes';
import { checkKitSource } from '../kit/limits';
import type { WorkspaceCore } from './useWorkspaceCore';

export interface DrawingRun {
  signal: AbortSignal;
  current: () => WorkspaceCore;
}

export interface DrawingSelection {
  ids: string[];
  options: DrawingOptions;
}

export function drawingGuard(core: WorkspaceCore, run: DrawingRun) {
  const original = {
    parts: core.parts,
    project: core.project,
    id: core.scene.sceneId,
    name: core.scene.sceneName,
    active: core.active,
  };

  return () => {
    run.signal.throwIfAborted();

    const current = run.current();

    if (
      current.active !== original.active ||
      current.docs.partsRef.current !== original.parts ||
      current.docs.projectRef.current !== original.project ||
      current.scene.sceneId !== original.id ||
      current.scene.sceneName !== original.name
    )
      throw new Error('The scene changed during export. Export drawings again.');
  };
}

export async function drawingExport(core: WorkspaceCore, selection: DrawingSelection, run: DrawingRun) {
  const mainStart = performance.now();
  const guard = drawingGuard(core, run);

  guard();

  const selected = new Set(selection.ids);
  const parts = core.parts.filter((part) => selected.has(part.id));

  checkKitSource(core.parts);

  const needsPurchases = parts.some((part) => boughtKey(part));
  const known = needsPurchases ? knownPurchases() : undefined;
  const beforeInventoryMs = performance.now() - mainStart;
  const inventory = needsPurchases && !known ? await platformBridge.listPurchases() : known;
  const afterInventoryStart = performance.now();
  const purchases = inventory ? structuredClone(inventory) : undefined;

  guard();

  const client = drawingsClient();
  const stop = () => client.dispose();
  const start = performance.now();

  run.signal.addEventListener('abort', stop, { once: true });

  try {
    const dispatchStart = performance.now();
    const pending = client.call('build', {
      parts,
      purchases,
      options: selection.options,
      sourceSnapshot: { parts: core.parts, project: core.project },
      source: {
        id: core.scene.sceneId,
        name: core.scene.sceneName,
        fingerprint: '',
      },
    });

    performance.clearMeasures('drawings:dispatch');
    performance.measure('drawings:dispatch', { start: dispatchStart });
    performance.clearMeasures('drawings:main');
    performance.measure('drawings:main', {
      start: mainStart,
      duration: beforeInventoryMs + performance.now() - afterInventoryStart,
    });

    const result = await pending;

    guard();
    performance.clearMeasures('drawings:prepare');
    performance.measure('drawings:prepare', { start });

    return result;
  } finally {
    run.signal.removeEventListener('abort', stop);
    client.dispose();
  }
}
