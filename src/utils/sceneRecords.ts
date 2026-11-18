import type { SavedSceneRecord } from '../types/robotics';
import { platformBridge } from './platformBridge';
import { upgradeSceneRecord } from './robotUpgrade';
import { sceneWritten } from './sceneWrites';
import { restoreWorldAssets, sceneWorldAssets } from '../cases/worldAssets';
import { validateParameterRecords } from './designParameters/verification';

export async function loadSceneRecord(id: string): Promise<SavedSceneRecord | null> {
  await sceneWritten(id);

  const record = await platformBridge.getScene(id);

  if (!record) {
    return null;
  }

  const assets = await restoreWorldAssets(record.worldAssets);

  validateParameterRecords(record.parts, record.project?.designParameters);

  sceneWorldAssets(record.project, assets);

  const upgraded = await upgradeSceneRecord(record).catch(() => null);

  if (!upgraded) {
    return record;
  }

  await platformBridge.saveScene({ ...upgraded, thumbnailDataUrl: undefined, keepUpdatedAt: true }).catch(() => {});

  return upgraded;
}
