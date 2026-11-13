import type { CodeReport } from './codeBridge';

interface Watched {
  source: string;
  read: () => CodeReport;
}

const watched = new Map<string, Watched>();
const MAX_WATCHED = 64;

export const codePanelKey = (caseId: string, panelId: string) => `${caseId}/${panelId}`;

export function watchCodeReport(key: string, source: string, read: () => CodeReport) {
  watched.delete(key);
  watched.set(key, { source, read });

  if (watched.size > MAX_WATCHED) watched.delete(watched.keys().next().value!);
}

export function codeReport(key: string, source: string): CodeReport | null {
  const entry = watched.get(key);

  return entry && entry.source === source ? entry.read() : null;
}
