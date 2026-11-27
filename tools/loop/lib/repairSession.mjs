import { CHANGE_SCHEMA, runAgent } from './agent.mjs';
import { hasPendingWorktree } from './deliveryState.mjs';
import { expandsTestExclusions } from './repairCoverage.mjs';
import { clearRecovery, recoveryFor, saveRecovery } from './workRecovery.mjs';
import { close, openBranch } from './worktree.mjs';

export function repairSession({ name, slug, prompt, options, complete, log }) {
  const key = `repair-${name}`;
  const recovery = recoveryFor(key);
  const worktree = recovery ? { dir: recovery.dir, branch: recovery.branch } : openBranch('repair', slug);
  let session = recovery?.session;
  const retain = (reason) =>
    saveRecovery(key, { worktree, session, reason: String(reason ?? 'Agent execution interrupted') });

  try {
    const context = recovery
      ? `Continue the retained edits and scratch/task-handoff.json. The previous visit stopped: ${recovery.reason}. Inspect current main before finishing. Do not repeat completed work or checks whose inputs have not changed.`
      : '';
    const result = runAgent({
      ...options(),
      cwd: worktree.dir,
      name,
      prompt: [prompt(), context].filter(Boolean).join('\n\n'),
      schema: CHANGE_SCHEMA,
      continuation: session,
    });

    session = result.session ?? session;

    if (!result.ok) {
      retain(result.error);

      return log(`${name} session failed, retained work for the next visit: ${String(result.error).slice(0, 500)}`);
    }

    if (expandsTestExclusions(worktree.dir)) {
      clearRecovery(key);

      return log(`${name} cannot expand quarantine coverage; the failed jobs remain eligible for a source repair`);
    }

    const outcome = complete(result.output, worktree);

    clearRecovery(key);

    return outcome;
  } catch (error) {
    session = error.session ?? session;

    if (hasPendingWorktree(worktree.dir)) clearRecovery(key);
    else retain(error.message);

    throw error;
  } finally {
    close(worktree);
  }
}
