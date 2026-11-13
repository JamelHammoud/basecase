import type { ServoFamily, ServoLog } from './types';

export interface KeptBenchLogs {
  logId: string;
  family: ServoFamily;
  logs: ServoLog[];
}

const kept = new Map<string, KeptBenchLogs>();
let next = 0;

export function keepBenchLogs(family: ServoFamily, logs: ServoLog[]): string {
  next += 1;

  const logId = `bench-${Date.now().toString(36)}-${next}`;

  kept.set(logId, { logId, family, logs });

  return logId;
}

export const keptBenchLogs = (logId: string | undefined) => (logId ? (kept.get(logId) ?? null) : null);
