import path from 'node:path';
import { ROOT, sh } from './gate.mjs';

function mainCheckout() {
  const r = sh('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']);

  return r.ok ? path.dirname(r.stdout.trim()) : ROOT;
}

export const TRAINER_ENV = path.join(mainCheckout(), 'library', 'trainer-env');

export const trainerPython = (script, args = [], options = {}) =>
  sh(
    'uv',
    [
      'run',
      '--project',
      path.join(ROOT, 'electron', 'trainer'),
      '--frozen',
      'python',
      '-u',
      path.join(ROOT, script),
      ...args,
    ],
    { ...options, env: { ...process.env, UV_PROJECT_ENVIRONMENT: TRAINER_ENV, PYTHONUNBUFFERED: '1', ...options.env } },
  );

export function jsonLines(text) {
  return text.split('\n').flatMap((line) => {
    if (!line.startsWith('{')) return [];

    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}
