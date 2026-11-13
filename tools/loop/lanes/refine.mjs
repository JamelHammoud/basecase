import { CHANGE_SCHEMA } from '../lib/agent.mjs';
import { inFlight, inFlightText } from '../lib/inFlight.mjs';
import { checkedRun } from '../lib/preflight.mjs';
import { publish } from '../lib/pull.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  agent: true,
  slots: 2,
  everySeconds: 60,
  does: 'Lands one refinement everywhere it holds, in one pull request',
};

export default function refine({ log }) {
  const worktree = openBranch('refine', 'fit');

  try {
    const taken = inFlightText(inFlight());
    const prompt = `Pick one refinement of Basecase and land it everywhere it holds, following your brief.\n\nThese pull requests are open or merged in the last day. Pick something none of them already changes:\n\n${taken}`;
    const result = checkedRun({
      cwd: worktree.dir,
      name: 'refine',
      prompt,
      schema: CHANGE_SCHEMA,
      hours: 6,
      kind: 'refine',
      log,
    });

    if (!result.ok) {
      log(`refine session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    const url = publish({ ...result.output, kind: 'refine' }, worktree);

    log(url ? `opened ${url}` : `no change: ${result.output.notes}`);
  } finally {
    close(worktree);
  }
}
