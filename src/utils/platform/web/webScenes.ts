import type { SavedSceneRecord, SavedSceneSummary, ScenePart } from '../../../types/robotics';
import type { ScenePreviewPayload } from '../types';
import { idbAll, idbDelete, idbGet, idbPut } from './idb';

type ScenePayload = Partial<SavedSceneRecord> & { keepUpdatedAt?: boolean; autosave?: boolean };

const deleted = new Set<string>();

const slug = (name?: string) =>
  name
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const isCatalogPart = (p: ScenePart) => p.kind === 'component' || Boolean(p.hardware);

const newest = (a: SavedSceneSummary, b: SavedSceneSummary) => (b.updatedAt || '').localeCompare(a.updatedAt || '');

export function summarizeScene(record: SavedSceneRecord): SavedSceneSummary {
  const parts = Array.isArray(record.parts) ? record.parts : [];

  return {
    id: record.id,
    name: record.name,
    globalGoal: record.globalGoal || '',
    updatedAt: record.updatedAt,
    previewDataUrl: record.previewDataUrl,
    sizeMm: record.sizeMm,
    partCount: parts.length || record.partCount || 0,
    catalogCount: parts.filter(isCatalogPart).length,
    commentCount: Array.isArray(record.annotations) ? record.annotations.length : 0,
  };
}

function sceneRecord(id: string, payload: ScenePayload, previous?: SavedSceneRecord): SavedSceneRecord {
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  const keepTime = payload.keepUpdatedAt && payload.updatedAt;

  return {
    id,
    name: payload.name || 'Untitled',
    globalGoal: payload.globalGoal || '',
    updatedAt: keepTime ? payload.updatedAt! : new Date().toISOString(),
    partCount: parts.length,
    previewDataUrl: payload.previewDataUrl ?? previous?.previewDataUrl,
    sizeMm: payload.sizeMm ?? previous?.sizeMm,
    chatId: payload.chatId ?? undefined,
    parts,
    annotations: payload.annotations || [],
    project: payload.project,
  };
}

export async function listScenes(): Promise<SavedSceneSummary[]> {
  return (await idbAll<SavedSceneRecord>('scenes')).map(summarizeScene).sort(newest);
}

export async function getScene(id: string): Promise<SavedSceneRecord | null> {
  return (await idbGet<SavedSceneRecord>('scenes', id)) ?? null;
}

export async function saveScene(payload: ScenePayload): Promise<SavedSceneSummary | null> {
  const id = payload.id || slug(payload.name) || `scene-${Date.now().toString(36)}`;

  if (payload.autosave && deleted.has(id)) return null;

  deleted.delete(id);

  const record = sceneRecord(id, payload, await idbGet<SavedSceneRecord>('scenes', id));

  await idbPut('scenes', id, record);

  return summarizeScene(record);
}

export async function saveScenePreview({ id, previewDataUrl, sizeMm }: ScenePreviewPayload) {
  const record = await getScene(id);

  if (!record) return null;

  const next = { ...record, previewDataUrl, sizeMm };

  await idbPut('scenes', id, next);

  return summarizeScene(next);
}

export async function deleteScene(id: string): Promise<SavedSceneSummary[]> {
  deleted.add(id);
  await idbDelete('scenes', id);

  return listScenes();
}
