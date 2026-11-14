import type { DiagnosticLevel } from '../../../topics/diagnostics';
import type { LogEntry, LogLevel } from '../../../topics/logs';
import type { TreeNode } from '../../../topics/messageTree';

export const LOG_SHOWN = 500;

export const LOG_TONES: Record<LogLevel, string> = {
  debug: 'text-white/50',
  info: 'text-white/60',
  warn: 'text-amber-400',
  error: 'text-red-400',
  fatal: 'text-red-400',
};

export const DIAGNOSTIC_TONES: Record<DiagnosticLevel, string> = {
  ok: 'text-white/60',
  warn: 'text-amber-400',
  error: 'text-red-400',
  stale: 'text-white/50',
};

export const secondsText = (at: number) => at.toFixed(2);

export function entriesUntil(entries: readonly LogEntry[], at: number, max = LOG_SHOWN): LogEntry[] {
  let lo = 0;
  let hi = entries.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;

    if (entries[mid].at <= at) lo = mid + 1;
    else hi = mid;
  }

  return entries.slice(Math.max(0, lo - max), lo);
}

export const isListNode = (node: TreeNode) =>
  !!node.children?.length && node.children.every((c, i) => c.key === String(i));

export const opensAtFirst = (node: TreeNode, depth: number) => !!node.children && !isListNode(node) && depth < 2;
