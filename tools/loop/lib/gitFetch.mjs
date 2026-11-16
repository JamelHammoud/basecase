import { claimWithin } from './claim.mjs';
import { HOME_CHECKOUT } from './paths.mjs';
import { run } from './sh.mjs';

export function fetchGit(args, options = {}, execute = run) {
  const release = claimWithin('git-fetch', { ms: 30_000, every: 25 });

  if (!release && options.allowFail) return { ok: false, out: '', err: 'The shared Git fetch is busy' };

  if (!release) throw new Error('The shared Git fetch is busy');

  try {
    return execute('git', ['fetch', ...args], { cwd: HOME_CHECKOUT, ...options });
  } finally {
    release();
  }
}
