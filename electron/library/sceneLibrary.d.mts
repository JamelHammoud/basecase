import type { SavedSceneRecord, SavedSceneSummary } from '../../src/types/robotics';

export class SceneLibrary {
  constructor(options: { scenesDir: string; cacheFile: string });
  list(): SavedSceneSummary[];
  get(id: string): SavedSceneRecord | null;
  save(payload: Partial<SavedSceneRecord> & { autosave?: boolean; history?: string }): SavedSceneSummary | null;
  savePreview(payload: { id: string; previewDataUrl?: string; sizeMm?: number[] }): SavedSceneSummary | null;
}
