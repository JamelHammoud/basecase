import { useEffect, useRef } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { useLatestRef } from '../utils/useLatestRef';
import { agentRequestSignal, cancellableAgentRequest } from './agentRequestScope';
import { assertAgentCurrent } from './agentTransaction';
import { awaitPartModels } from './agentPartModels';
import { requestHandler, type RequestContext } from './agentRequestHandlers';
import type { AgentRequestEvent } from './types';

interface ScopedAuthor {
  laneId: string;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}

interface Options {
  sceneId: string;
  flagsOf: (id: string) => { stopped: boolean };
  viewport: () => Viewport3DHandle | null;
}

export function useAgentRequestScope(options: Options) {
  'use memo';

  const latest = useLatestRef(options);
  const pending = useRef(new Set<AbortController>());

  useEffect(() => {
    const active = pending.current;

    return () => {
      for (const controller of active) controller.abort();
    };
  }, [options.sceneId]);

  return async <Author extends ScopedAuthor>(
    event: Pick<AgentRequestEvent, 'kind' | 'payload'>,
    author: Author,
    contextFor: (author: Author) => RequestContext,
  ) => {
    const handler = requestHandler(event.kind);

    if (!handler) throw new Error(`Unknown request "${event.kind}"`);

    const owner = latest.current.flagsOf(author.laneId);
    const controller = new AbortController();
    const started = latest.current.sceneId;
    const guarded = {
      ...author,
      signal: AbortSignal.any([controller.signal, agentRequestSignal(owner)]),
      isCurrent: () =>
        latest.current.sceneId === started && latest.current.flagsOf(author.laneId) === owner && !owner.stopped,
    };

    pending.current.add(controller);

    const run = async () => {
      assertAgentCurrent(guarded);
      await cancellableAgentRequest(awaitPartModels(event.kind, latest.current.viewport()), guarded.signal);
      assertAgentCurrent(guarded);

      const result = await cancellableAgentRequest(
        Promise.resolve(handler(event.payload, contextFor(guarded), event.kind)),
        guarded.signal,
      );

      assertAgentCurrent(guarded);

      return result;
    };

    return run().finally(() => pending.current.delete(controller));
  };
}
