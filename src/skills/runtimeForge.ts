import { lastError, type ForgeRunner } from './forgeRunner';
import type { RuntimeDeps, Run } from './skillsRuntimeTypes';
import type { SkillJob } from './skillRows';
import type { SnapshotRef } from './snapshots';

export function runtimeForge(options: {
  deps: RuntimeDeps;
  run: Run;
  signal: AbortSignal;
  setJob: (patch: Partial<SkillJob>) => void;
  snapshot: (ref: SnapshotRef) => void;
  failed: (message: string | null) => void;
}): ForgeRunner {
  const { deps, run, signal, setJob, snapshot, failed } = options;
  const forge = deps.forge({
    background: run.background,
    recoveryKey: run.background ? undefined : deps.recovery?.key,
    signal,
    onProgress: (p) => setJob({ share: p.share, message: p.message }),
    onSnapshot: snapshot,
  });

  const runner: ForgeRunner = async (job) => {
    setJob({ message: 'Starting', share: null });

    const outcome = await forge(job);

    if (outcome.ok) failed(null);
    else if (!signal.aborted) failed(lastError(outcome));

    setJob({ message: 'Checking in Arena', share: null });

    return outcome;
  };

  runner.selected = forge.selected;
  runner.canWarm = forge.canWarm;

  return runner;
}
