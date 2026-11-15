import type { ScenePart } from '../types/robotics';
import { timeSlicer } from './yieldToMain';
import type { ProjectSettings } from '../types/robotics';
import { sceneWorldAssets, worldAssetJson } from '../cases/worldAssets';

const partJson = new WeakMap<ScenePart, string>();

function jsonOf(part: ScenePart): string {
  const cached = partJson.get(part);

  if (cached !== undefined) return cached;

  const json = JSON.stringify(part);

  partJson.set(part, json);

  return json;
}

export async function sceneJson(payload: { parts: ScenePart[] } & Record<string, unknown>): Promise<string> {
  const { parts, ...rest } = payload;
  const breathe = timeSlicer();
  const items: string[] = [];

  for (const part of parts) {
    await breathe();
    items.push(jsonOf(part));
  }

  const assets = sceneWorldAssets(rest.project as ProjectSettings | undefined);
  const assetEntries = Object.entries(assets).map(
    ([hash, asset]) => `${JSON.stringify(hash)}:${worldAssetJson(asset)}`,
  );
  const head = JSON.stringify(rest);
  const separator = head === '{}' ? '' : ',';
  const assetsJson = assetEntries.length ? `,"worldAssets":{${assetEntries.join(',')}}` : '';

  return `${head.slice(0, -1)}${separator}"parts":[${items.join(',')}]${assetsJson}}`;
}
