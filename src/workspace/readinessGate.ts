import { followUpPrompt, newBlockers } from '../readiness/readiness';
import type { Readiness } from '../readiness/types';
import type { WorkspaceCore } from './useWorkspaceCore';

const MAX_FOLLOW_UPS = 2;

export function readinessGate(core: WorkspaceCore) {
  const { readiness, studio } = core;
  let before: Promise<Readiness | null> = Promise.resolve(null);
  let rounds = 0;

  return {
    begin: () => {
      before = readiness.checkNow();
      void before.then(() => readiness.startTurn());
    },
    followUp: async (): Promise<string | null> => {
      if (!studio.autoFixBlockers || rounds >= MAX_FOLLOW_UPS) return null;

      const [was, now] = [await before, await readiness.checkNow()];

      if (!was || !now || was.fingerprint === now.fingerprint) return null;

      if (now.status === 'blockout' || now.status === 'empty') return null;

      const added = newBlockers(was, now);

      if (!added.length) return null;

      rounds++;

      return followUpPrompt(added);
    },
  };
}
