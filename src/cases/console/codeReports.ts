import type { CodeReport } from './codeBridge';

interface Watched {
  source: string;
  read: () => CodeReport;
  order: number;
}

const watched = new Map<string, Watched>();
const MAX_WATCHED = 64;
let registered = 0;

export const codePanelKey = (caseId: string, panelId: string) => `${caseId}/${panelId}`;

export const codeReportsWatched = () => registered;

export function watchCodeReport(key: string, source: string, read: () => CodeReport) {
  registered += 1;
  watched.delete(key);
  watched.set(key, { source, read, order: registered });

  if (watched.size > MAX_WATCHED) watched.delete(watched.keys().next().value!);
}

export function codeReport(key: string, source: string, since = 0): CodeReport | null {
  const entry = watched.get(key);

  return entry && entry.source === source && entry.order > since ? entry.read() : null;
}
