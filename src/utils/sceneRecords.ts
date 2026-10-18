import type { SavedSceneRecord } from '../types/robotics';
import { platformBridge } from './platformBridge';
import { upgradeSceneRecord } from './robotUpgrade';

export async function loadSceneRecord(id: string): Promise<SavedSceneRecord | null> {
  const record = await platformBridge.getScene(id);

  if (!record) {
    return null;
  }

  const upgraded = await upgradeSceneRecord(record).catch(() => null);

  if (!upgraded) {
    return record;
  }

  await platformBridge.saveScene({ ...upgraded, thumbnailDataUrl: undefined, keepUpdatedAt: true }).catch(() => {});

  return upgraded;
}
