import type { SavedSceneRecord, SavedSceneSummary, ScenePart } from '../../../types/robotics';

const isCatalogPart = (p: ScenePart) => p.kind === 'component' || Boolean(p.hardware);

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

export function migrateSceneSummaries(transaction: IDBTransaction) {
  const summaries = transaction.objectStore('sceneSummaries');
  const request = transaction.objectStore('scenes').openCursor();

  request.onsuccess = () => {
    const cursor = request.result;

    if (!cursor) return;

    summaries.put(summarizeScene(cursor.value as SavedSceneRecord), cursor.primaryKey);
    cursor.continue();
  };
}
