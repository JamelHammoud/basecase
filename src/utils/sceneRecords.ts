import { validSceneAppearances } from '../appearance/validation';
import type { SavedSceneRecord } from '../types/robotics';
import { platformBridge } from './platformBridge';
import { upgradeSceneRecord } from './robotUpgrade';
import { sceneWritten } from './sceneWrites';
import { restoreWorldAssets, sceneAssets } from '../cases/worldAssets';
import { validateParameterScene } from './designParameters/verification';

export async function loadSceneRecord(id: string): Promise<SavedSceneRecord | null> {
  await sceneWritten(id);

  const record = await platformBridge.getScene(id);

  if (!record) {
    return null;
  }

  const assets = await restoreWorldAssets(record.worldAssets);

  if (!validSceneAppearances(record.parts, record.project)) throw new Error('The scene’s parts are damaged.');

  validateParameterScene(record);

  sceneAssets(record.project, record.parts, assets);

  const upgraded = await upgradeSceneRecord(record).catch(() => null);

  if (!upgraded) {
    return record;
  }

  await platformBridge.saveScene({ ...upgraded, thumbnailDataUrl: undefined, keepUpdatedAt: true }).catch(() => {});

  return upgraded;
}
