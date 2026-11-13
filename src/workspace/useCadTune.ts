import { useRef } from 'react';
import { tunedCad, withTunedPart } from '../agent/cadTune';
import { platformBridge } from '../utils/platformBridge';
import type { WorkspaceCore } from './useWorkspaceCore';

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useCadTune({ docs, showToast, workspaceId }: WorkspaceCore) {
  const { partsRef, commitParts } = docs;
  const queues = useRef(new Map<string, Promise<void>>());

  const run = async (id: string, values: Record<string, number>) => {
    const source = partsRef.current.find((p) => p.id === id)?.cad;

    if (!source) return;

    try {
      const tuned = tunedCad(await platformBridge.tuneCadPart({ workspaceId, id, values }), source.expect);

      if ('error' in tuned) {
        showToast(tuned.error, { tone: 'error' });

        return;
      }

      if (partsRef.current.find((p) => p.id === id)?.cad?.code !== source.code) return;

      commitParts((prev) => withTunedPart(prev, id, tuned.cad));
    } catch (err) {
      showToast(messageOf(err), { tone: 'error' });
    }
  };

  const tune = (id: string, values: Record<string, number>) => {
    const next = (queues.current.get(id) ?? Promise.resolve()).then(() => run(id, values));

    queues.current.set(id, next);

    return next;
  };

  return { tune };
}
