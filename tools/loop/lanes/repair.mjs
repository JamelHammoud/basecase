import { CHANGE_SCHEMA, runAgent } from '../lib/agent.mjs';
import { failedLog, latestMainCheck, openPulls, repo } from '../lib/github.mjs';
import { publish } from '../lib/pull.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

const MAX_LOG = 80_000;
const HANDLED_FOR_MS = 6 * 60 * 60 * 1000;

const beingRepaired = () =>
  openPulls().some(
    (pull) => pull.headRefName.startsWith('loop/repair/') && Date.now() - Date.parse(pull.createdAt) < HANDLED_FOR_MS,
  );

export default function repair({ log }) {
  const latest = latestMainCheck();

  if (!latest || latest.status !== 'completed' || latest.conclusion !== 'failure') {
    log('main is green, or Check is still running');

    return;
  }

  if (beingRepaired()) {
    log('a repair pull request is already open');

    return;
  }

  const runUrl = `https://github.com/${repo()}/actions/runs/${latest.databaseId}`;
  const worktree = openBranch('repair', `main-${latest.headSha.slice(0, 7)}`);

  try {
    const prompt = [
      `Check failed on main at ${latest.headSha} (${runUrl}).`,
      'The failed steps’ log, last part:',
      failedLog(latest.databaseId).slice(-MAX_LOG),
    ].join('\n\n');
    const result = runAgent({ cwd: worktree.dir, name: 'repair', prompt, schema: CHANGE_SCHEMA });

    if (!result.ok) {
      log(`repair session failed: ${String(result.error).slice(0, 500)}`);

      return;
    }

    const url = publish(
      { ...result.output, kind: 'repair' },
      { ...worktree, extra: { failure: `[Check on main, ${latest.headSha.slice(0, 7)}](${runUrl})` } },
    );

    log(url ? `opened ${url}` : `no change: ${result.output.notes}`);
  } finally {
    close(worktree);
  }
}
