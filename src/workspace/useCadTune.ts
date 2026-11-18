import { useRef } from 'react';
import { tunedCad, withTunedPart } from '../agent/cadTune';
import { platformBridge } from '../utils/platformBridge';
import type { WorkspaceCore } from './useWorkspaceCore';
import { errorMessage } from '../utils/errorMessage';

export function useCadTune({ docs, showToast, workspaceId }: WorkspaceCore) {
  const { partsRef, commitParts } = docs;
  const queues = useRef(new Map<string, Promise<void>>());

  const run = async (id: string, values: Record<string, number>) => {
    const part = partsRef.current.find((p) => p.id === id);
    const source = part?.cad;

    if (!source) return;

    if (part?.dimensionBindings?.some((binding) => binding.kind === 'cad' && Object.hasOwn(values, binding.target))) {
      showToast('Edit the shared parameter or unbind this dimension.', { tone: 'error' });

      return;
    }

    try {
      const tuned = tunedCad(await platformBridge.tuneCadPart({ workspaceId, id, values }), source.expect);

      if ('error' in tuned) {
        showToast(tuned.error, { tone: 'error' });

        return;
      }

      if (partsRef.current.find((p) => p.id === id)?.cad?.code !== source.code) return;

      commitParts((prev) => withTunedPart(prev, id, tuned.cad));
    } catch (err) {
      showToast(errorMessage(err), { tone: 'error' });
    }
  };

  const tune = (id: string, values: Record<string, number>) => {
    const next = (queues.current.get(id) ?? Promise.resolve()).then(() => run(id, values));

    queues.current.set(id, next);

    return next;
  };

  return { tune };
}
