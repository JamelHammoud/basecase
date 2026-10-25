import type { ScenePart } from '../types/robotics';
import { timeSlicer } from './yieldToMain';

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

  const head = JSON.stringify(rest);
  const separator = head === '{}' ? '' : ',';

  return `${head.slice(0, -1)}${separator}"parts":[${items.join(',')}]}`;
}
