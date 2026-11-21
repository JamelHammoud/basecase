import { checkedSceneHistory } from '../../../../electron/library/sceneHistory.mjs';
import type { VersionedSceneRecord } from '../../../types/sceneHistory';
import type { SavedSceneRecord, SavedSceneSummary } from '../../../types/robotics';
import type { ScenePreviewPayload } from '../types';
import { idbAll, idbGet, idbWrite } from './idb';
import { webSceneHistory } from './webSceneHistoryClient';
import { summarizeScene } from './sceneSummary';

type ScenePayload = Partial<VersionedSceneRecord> & { keepUpdatedAt?: boolean; autosave?: boolean };

const deleted = new Set<string>();

const slug = (name?: string) =>
  name
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const newest = (a: SavedSceneSummary, b: SavedSceneSummary) => (b.updatedAt || '').localeCompare(a.updatedAt || '');

async function writeScene(record: VersionedSceneRecord): Promise<SavedSceneSummary> {
  const summary = summarizeScene(record);

  const pending =
    record.history !== undefined
      ? webSceneHistory.call('save', { record, summary })
      : idbWrite([
          { kind: 'put', store: 'scenes', key: record.id, value: record },
          { kind: 'put', store: 'sceneSummaries', key: record.id, value: summary },
        ]);

  await pending;

  return summary;
}

function sceneRecord(id: string, payload: ScenePayload, previous?: SavedSceneSummary): VersionedSceneRecord {
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
    worldAssets: payload.worldAssets,
    history: checkedSceneHistory(payload.history),
  };
}

export async function listScenes(): Promise<SavedSceneSummary[]> {
  return (await idbAll<SavedSceneSummary>('sceneSummaries')).sort(newest);
}

export async function getScene(id: string): Promise<VersionedSceneRecord | null> {
  const record = await idbGet<SavedSceneRecord>('scenes', id);

  if (!record) return null;

  const history = await webSceneHistory.call('load', id);

  return history === undefined ? record : { ...record, history };
}

export async function saveScene(payload: ScenePayload): Promise<SavedSceneSummary | null> {
  const id = payload.id || slug(payload.name) || `scene-${Date.now().toString(36)}`;

  if (payload.autosave && deleted.has(id)) return null;

  deleted.delete(id);

  const record = sceneRecord(id, payload, await idbGet<SavedSceneSummary>('sceneSummaries', id));

  return writeScene(record);
}

export async function saveScenePreview({ id, previewDataUrl, sizeMm }: ScenePreviewPayload) {
  const record = await idbGet<SavedSceneRecord>('scenes', id);

  if (!record) return null;

  return writeScene({ ...record, previewDataUrl, sizeMm });
}

export async function deleteScene(id: string): Promise<SavedSceneSummary[]> {
  deleted.add(id);
  await idbWrite([
    { kind: 'delete', store: 'scenes', key: id },
    { kind: 'delete', store: 'sceneSummaries', key: id },
    { kind: 'delete', store: 'settings', key: `scene-history/ref/${id}` },
  ]);

  return listScenes();
}
