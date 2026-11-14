import { spawnSync } from 'node:child_process';
import os from 'node:os';

export const DRAINS = new Set(['review', 'revise', 'rebase', 'repair', 'doctor', 'merge', 'flakes']);
export const LIMITS = { producer: { sessions: 8, load: 2 }, drain: { sessions: 14, load: Infinity } };

export function capacityHold({ lane, sessions, loadPerCore }) {
  const limit = DRAINS.has(lane) ? LIMITS.drain : LIMITS.producer;

  if (sessions >= limit.sessions) return `${sessions} agent sessions are running`;

  if (loadPerCore >= limit.load) return `the Mac is at ${loadPerCore.toFixed(1)}× its cores`;

  return null;
}

const SESSION = /(^|\/)claude (-p|--print)\b/;

export function measure() {
  const listed = spawnSync('ps', ['-A', '-o', 'command='], { encoding: 'utf8' }).stdout ?? '';

  return {
    sessions: listed.split('\n').filter((line) => SESSION.test(line)).length,
    loadPerCore: os.loadavg()[0] / os.cpus().length,
  };
}
