import { claimWithin } from './claim.mjs';
import { HOME_CHECKOUT } from './paths.mjs';
import { run } from './sh.mjs';

export function fetchGit(args, options = {}, execute = run) {
  const timeout = options.timeout ?? 10 * 60 * 1000;
  const deadline = Date.now() + timeout;
  const release = claimWithin('git-fetch', { ms: Math.min(30_000, timeout), every: Math.min(25, timeout) });

  if (!release && options.allowFail) return { ok: false, out: '', err: 'The shared Git fetch is busy' };

  if (!release) throw new Error('The shared Git fetch is busy');

  try {
    const remaining = deadline - Date.now();
    const err = 'The Git fetch timed out waiting for its claim';

    if (remaining <= 0 && options.allowFail) return { ok: false, out: '', err };

    if (remaining <= 0) throw new Error(err);

    return execute('git', ['fetch', ...args], { cwd: HOME_CHECKOUT, ...options, timeout: remaining });
  } finally {
    release();
  }
}
