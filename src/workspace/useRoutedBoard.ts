import { useEffect, useRef } from 'react';
import { electricalClient } from '../wiring/electricalClient';
import { electricalSnapshot, electricalWalk } from '../wiring/electricalSnapshot';
import { freshWalk } from './storedWalk';
import { sourcedMeshFiles } from '../three/componentMeshes';
import { pickFiles } from '../utils/pickFiles';
import { useLatestRef } from '../utils/useLatestRef';
import { errorMessage } from '../utils/errorMessage';
import { validateNativeBoard } from '../wiring/boardNativeClient';
import { boardImportMessage } from '../wiring/boardRoutingFindings';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useRoutedBoard(core: WorkspaceCore) {
  'use memo';

  const current = useLatestRef(core);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  return async () => {
    if (active.current) return;

    const [file] = await pickFiles('.kicad_pcb');

    if (!file || active.current || !mounted.current) return;

    const abort = new AbortController();
    const original = current.current;
    const { parts, project } = original;
    const id = original.scene.sceneId;
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

    active.current = abort;
    abort.signal.addEventListener('abort', stop, { once: true });
    original.showToast('Importing board…', {
      tone: 'progress',
      action: { label: 'Cancel', onClick: () => abort.abort() },
    });

    try {
      if (file.size > 8 * 1024 * 1024) throw new Error(boardImportMessage('board-format'));

      const bytes = new Uint8Array(await file.arrayBuffer());
      const meshFiles = await sourcedMeshFiles(parts);
      const walk = project.walk ? freshWalk(parts, project) : undefined;
      const input = { ...electricalSnapshot({ parts, project }), meshFiles, walk: electricalWalk(walk) };

      guard();

      const board = await client.call('importBoard', { input, bytes }, [bytes.buffer]);
      const prepared = await client.call('prepareExport', {
        ...input,
        project: { ...input.project, electronicsBoard: board },
      });
      const result = prepared.request ? await validateNativeBoard(prepared.request, abort.signal) : null;

      guard();

      if (result && board.routed)
        board.routed.evidence = {
          key: result.key,
          version: result.version,
          issues: result.issues,
          report: result.report,
          metrics: result.metrics,
        };

      original.docs.commitBoard(parts, board);
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
