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

const CLAUDE_SESSION = /^\s*(?:\S*\/)?claude (-p|--print)\b/;
const CODEX_SESSION = /^\s*(?:\S*\/)?codex\s+(?:--search\s+)?exec(?:\s|$)/;

export const sessionCount = (listed) =>
  listed.split('\n').filter((line) => CLAUDE_SESSION.test(line) || CODEX_SESSION.test(line)).length;

export function measure() {
  const listed = spawnSync('ps', ['-A', '-o', 'command='], { encoding: 'utf8' }).stdout ?? '';

  return {
    sessions: sessionCount(listed),
    loadPerCore: os.loadavg()[0] / os.cpus().length,
  };
}
