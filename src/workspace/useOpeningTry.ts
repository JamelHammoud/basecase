import { useEffect, useEffectEvent, useRef } from 'react';
import { loadManifests } from '../cases/tryStore';
import { tryRecordOf } from '../cases/tryFile';
import { errorMessage } from '../utils/errorMessage';
import type { WorkspaceSeed } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useOpeningTry({ seed, core, active }: { seed?: WorkspaceSeed; core: WorkspaceCore; active: boolean }) {
  const id = seed?.openTry;
  const opened = useRef(false);
  const open = useEffectEvent(async () => {
    if (opened.current || !id) return;

    opened.current = true;

    try {
      const [stored] = await loadManifests([id]);

      if (stored) await core.simTraining.cases.timeline.show(tryRecordOf(stored));
    } catch (error) {
      core.showToast(errorMessage(error), { tone: 'error' });
    }
  });

  useEffect(() => {
    if (active && id) void open();
  }, [active, id]);
}
