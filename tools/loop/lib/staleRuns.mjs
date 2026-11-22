import { OWNER_LOGIN } from './paths.mjs';
import { json, run } from './sh.mjs';

export function runPullNumber(item) {
  const linked = item.pull_requests ?? [];

  if (linked.length === 1) return linked[0].number;

  if (linked.length > 1) return null;

  return Number(/^refs\/pull\/(\d+)\/head$/.exec(item.head_branch)?.[1]) || null;
}

const ownedPull = (pull) =>
  pull?.user?.login === OWNER_LOGIN &&
  pull.head?.ref?.startsWith('loop/') &&
  Boolean(pull.head.repo?.full_name) &&
  pull.head.repo.full_name === pull.base?.repo?.full_name &&
  pull.base.ref === 'main';

export function obsoleteRun(item, pull) {
  return (
    item.status !== 'completed' &&
    /^[a-f0-9]{40}$/.test(item.head_sha) &&
    /^[a-f0-9]{40}$/.test(pull?.head?.sha) &&
    ownedPull(pull) &&
    (pull.state === 'closed' || (pull.state === 'open' && item.head_sha !== pull.head.sha))
  );
}

export function cancelObsoleteRuns(log) {
  const cancelled = new Set();
  const statuses = ['queued', 'in_progress', 'pending', 'waiting', 'requested'];

  for (const status of statuses) {
    const pages = json('gh', [
      'api',
      '--paginate',
      '--slurp',
      `repos/{owner}/{repo}/actions/runs?status=${status}&per_page=100`,
    ]);

    for (const item of pages.flatMap((page) => page.workflow_runs)) {
      const number = runPullNumber(item);

      if (!number || cancelled.has(item.id)) continue;

      const pull = json('gh', ['api', `repos/{owner}/{repo}/pulls/${number}`]);

      if (!obsoleteRun(item, pull)) continue;

      run('gh', ['run', 'cancel', String(item.id)]);
      cancelled.add(item.id);
      log(`cancelled obsolete run ${item.id} for #${number}: ${item.html_url}`);
    }
  }
}
