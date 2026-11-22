import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { loadManifests } from '../cases/tryStore';
import { tryRecordOf } from '../cases/tryFile';
import { errorMessage } from '../utils/errorMessage';
import type { WorkspaceSeed } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useOpeningTry({ seed, core, active }: { seed?: WorkspaceSeed; core: WorkspaceCore; active: boolean }) {
  const [request, setRequest] = useState(() => (seed?.openTry ? { id: seed.openTry } : null));
  const opened = useRef<typeof request>(null);
  const open = useEffectEvent(async (id: string) => {
    try {
      const [stored] = await loadManifests([id]);

      if (stored) await core.simTraining.cases.timeline.show(tryRecordOf(stored));
    } catch (error) {
      core.showToast(errorMessage(error), { tone: 'error' });
    }
  });

  useEffect(() => {
    if (!active || !request || opened.current === request) return;

    opened.current = request;
    void open(request.id);
  }, [active, request]);

  return (id: string) => setRequest({ id });
}
