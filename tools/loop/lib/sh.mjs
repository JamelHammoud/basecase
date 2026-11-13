import { spawnSync } from 'node:child_process';

const tail = (text, chars) => (text || '').slice(-chars);

export function run(cmd, args, { cwd, input, timeout = 10 * 60 * 1000, allowFail = false, env } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    input,
    timeout,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : process.env,
  });
  const ok = result.status === 0 && !result.error;

  if (!ok && !allowFail) {
    const why = result.error ? result.error.message : `exit ${result.status}`;

    throw new Error(`${cmd} ${args.slice(0, 4).join(' ')} failed (${why}): ${tail(result.stderr, 2000)}`);
  }

  return { ok, out: (result.stdout || '').trim(), err: (result.stderr || '').trim() };
}

export const json = (cmd, args, opts) => {
  const { out } = run(cmd, args, opts);

  return out ? JSON.parse(out) : null;
};
