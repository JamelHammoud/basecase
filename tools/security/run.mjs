import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    input: options.input,
  });

  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error };
}

export function has(cmd) {
  return run('/bin/sh', ['-c', `command -v ${cmd}`]).status === 0;
}

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });

  if (!response.ok) throw new Error(`${url} answered ${response.status}`);

  return response.json();
}

export const finding = (severity, title, detail = '', fix = '') => ({ severity, title, detail, fix });
