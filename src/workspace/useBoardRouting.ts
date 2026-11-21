import { useEffect, useRef } from 'react';
import { useLatestRef } from '../utils/useLatestRef';
import { errorMessage } from '../utils/errorMessage';
import { electricalClient } from '../wiring/electricalClient';
import { electricalSnapshot, electricalWalk } from '../wiring/electricalSnapshot';
import { routeNativeCopper } from '../wiring/boardRouteClient';
import { validateNativeBoard } from '../wiring/boardNativeClient';
import { boardImportMessage } from '../wiring/boardRoutingFindings';
import { sourcedMeshFiles } from '../three/componentMeshes';
import { freshWalk } from './storedWalk';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useBoardRouting(core: WorkspaceCore) {
  'use memo';

  const current = useLatestRef(core);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), [core.parts, core.project, core.scene.sceneId]);

  return async () => {
    if (active.current) return;

    const original = current.current;
    const { parts, project } = original;
    const id = original.scene.sceneId;
    const abort = new AbortController();
    const client = electricalClient();
    const stop = () => client.dispose();
    const guard = () => {
      abort.signal.throwIfAborted();

      if (
        current.current.docs.partsRef.current !== parts ||
        current.current.docs.projectRef.current !== project ||
        current.current.scene.sceneId !== id
      )
        throw new Error(boardImportMessage('board-stale-routing'));
    };

    ['board-route:snapshot', 'board-route:dispatch', 'board-route:commit'].forEach((name) =>
      performance.clearMeasures(name),
    );
    active.current = abort;
    abort.signal.addEventListener('abort', stop, { once: true });
    original.showToast('Routing board…', {
      tone: 'progress',
      action: { label: 'Cancel', onClick: () => abort.abort() },
    });

    try {
      const meshFiles = await sourcedMeshFiles(parts);
      const snapshotStart = performance.now();
      const walk = project.walk ? freshWalk(parts, project) : undefined;
      const input = { ...electricalSnapshot({ parts, project }), meshFiles, walk: electricalWalk(walk) };

      performance.measure('board-route:snapshot', { start: snapshotStart });

      const dispatchStart = performance.now();
      const pending = client.call('prepareRoute', input);

      performance.measure('board-route:dispatch', { start: dispatchStart });

      const request = await pending;

      guard();

      const routed = await routeNativeCopper(request, abort.signal);

      guard();

      const board = await client.call('importText', { input, pcb: routed.pcb });

      if (!board.routed) throw new Error(boardImportMessage('board-format'));

      board.routed.provenance = routed.provenance;

      const prepared = await client.call('prepareExport', {
        ...input,
        project: { ...input.project, electronicsBoard: board },
      });

      guard();

      if (!prepared.request) throw new Error(boardImportMessage('board-stale-routing'));

      const result = await validateNativeBoard(prepared.request, abort.signal);

      guard();

      const accepted = await client.call('acceptRoute', { board, request: prepared.request, result });

      guard();

      const commitStart = performance.now();

      original.docs.commitBoard(parts, accepted);
      performance.measure('board-route:commit', { start: commitStart });
      original.tool.openRightTab('build');
      original.toasts.dismissToast();
    } catch (error) {
      if (abort.signal.aborted) original.toasts.dismissToast();
      else original.showToast(errorMessage(error), { tone: 'error' });
    } finally {
      abort.signal.removeEventListener('abort', stop);
      client.dispose();
      active.current = null;
    }
  };
}
