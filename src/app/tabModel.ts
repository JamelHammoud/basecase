import type { WorkspaceMeta, WorkspaceSeed } from '../SceneWorkspace';
import type { SavedSceneRecord } from '../types/robotics';
import { newSceneId } from '../utils/sceneIds';

export const MAX_TABS = 8;
export const CLOSED_LIMIT = 10;
export const FIRST_TAB = 'main';

export interface TabEntry {
  id: string;
  seed?: WorkspaceSeed;
}

export interface ClosedTab {
  seed: WorkspaceSeed;
  index: number;
}

export interface TabListItem {
  id: string;
  name: string;
  sceneId: string;
}

export type Metas = Record<string, WorkspaceMeta>;

export const newTabId = () => `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function untitledName(taken: Set<string>): string {
  let sceneName = 'Untitled';
  let n = 2;

  while (taken.has(sceneName)) {
    sceneName = `Untitled ${n}`;
    n++;
  }

  return sceneName;
}

export function blankSeed(metas: Metas, closing: string[] = []): WorkspaceSeed {
  const names = new Set(
    Object.entries(metas)
      .filter(([id]) => !closing.includes(id))
      .map(([, m]) => m.name),
  );

  return {
    sceneId: newSceneId(),
    sceneName: untitledName(names),
    globalGoal: '',
    parts: [],
    annotations: [],
    blank: true,
  };
}

export function seedFromRecord(record: SavedSceneRecord): WorkspaceSeed {
  return {
    sceneId: record.id,
    sceneName: record.name,
    globalGoal: record.globalGoal || '',
    parts: record.parts || [],
    annotations: record.annotations || [],
    project: record.project,
  };
}

export function findSceneTab(tabs: TabEntry[], metas: Metas, sceneId: string): TabEntry | undefined {
  return tabs.find((t) => metas[t.id]?.sceneId === sceneId);
}

export function insertTab(tabs: TabEntry[], entry: TabEntry, at: number): TabEntry[] {
  const next = [...tabs];

  next.splice(Math.max(0, Math.min(at, next.length)), 0, entry);

  return next;
}

export function moveTab(tabs: TabEntry[], from: number, to: number): TabEntry[] {
  const next = [...tabs];
  const [moved] = next.splice(from, 1);

  next.splice(to, 0, moved);

  return next;
}

export function omitKeys<T>(record: Record<string, T>, ids: string[]): Record<string, T> {
  const next = { ...record };

  ids.forEach((id) => delete next[id]);

  return next;
}

export interface NextActiveInput {
  list: TabEntry[];
  ids: string[];
  activeId: string;
  remaining: TabEntry[];
}

export function nextActiveAfterClose({ list, ids, activeId, remaining }: NextActiveInput): string {
  if (!ids.includes(activeId)) return activeId;

  const from = list.findIndex((t) => t.id === activeId);
  const after = list.slice(from + 1).find((t) => !ids.includes(t.id));
  const before = list
    .slice(0, from)
    .reverse()
    .find((t) => !ids.includes(t.id));

  return (after ?? before ?? remaining[0]).id;
}

export function closedMessage(remember: ClosedTab[], stoppedAgent: boolean): string {
  const name = remember.length === 1 ? remember[0].seed.sceneName : `${remember.length} scenes`;

  return stoppedAgent ? `Closed ${name} and stopped its agent` : `Closed ${name}`;
}

export function tabListOf(tabs: TabEntry[], metas: Metas): TabListItem[] {
  return tabs.map((t) => ({
    id: t.id,
    name: metas[t.id]?.name ?? t.seed?.sceneName ?? 'Untitled',
    sceneId: metas[t.id]?.sceneId ?? t.seed?.sceneId ?? '',
  }));
}

export function sceneTabsOf(tabs: TabEntry[], metas: Metas) {
  return tabs.map((t) => {
    const meta = metas[t.id];

    return {
      id: t.id,
      name: meta?.name ?? t.seed?.sceneName ?? 'Untitled',
      partCount: meta?.partCount ?? t.seed?.parts.length ?? 0,
      busy: !!meta?.busy,
      activity: meta?.activity ?? '',
    };
  });
}

export function idsAfter(tabs: TabEntry[], id: string): string[] {
  return tabs.slice(tabs.findIndex((t) => t.id === id) + 1).map((t) => t.id);
}

export function idsExcept(tabs: TabEntry[], id: string): string[] {
  return tabs.filter((t) => t.id !== id).map((t) => t.id);
}
