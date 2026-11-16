import type { Environment } from './environment';
import type { ArenaEvidence } from './artifacts';
import type { KitOutcome } from './motorKit';

export interface InstallResult {
  status: 'passed' | 'failed' | 'cancelled' | 'infrastructure';
  evidence?: ArenaEvidence;
  environment?: Environment;
}

export type InstallCompleted = (result: InstallResult) => void | Promise<unknown>;

function notify(completed: InstallCompleted | undefined, result: InstallResult) {
  try {
    void Promise.resolve(completed?.(result)).catch(() => {});
  } catch {
    return;
  }
}

export async function observeInstall(options: {
  signal: AbortSignal;
  work: () => Promise<KitOutcome>;
  completed?: InstallCompleted;
  infrastructure?: () => boolean;
}): Promise<KitOutcome> {
  const { signal, work, completed } = options;

  try {
    const outcome = await work();
    const evidence = outcome.kind === 'skill' ? outcome.skill.evidence : outcome.evidence;
    const status = outcome.kind === 'skill' ? 'passed' : 'failed';
    const environment = outcome.environment;

    if (signal.aborted) notify(completed, { status: 'cancelled' });
    else if (outcome.kind !== 'skill' && options.infrastructure?.()) notify(completed, { status: 'infrastructure' });
    else notify(completed, { status, ...(evidence ? { evidence } : {}), ...(environment ? { environment } : {}) });

    return outcome;
  } catch (error) {
    notify(completed, { status: signal.aborted ? 'cancelled' : 'infrastructure' });

    throw error;
  }
}
