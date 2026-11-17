import { historyLiteral } from '../workspace/versionClient';
import type { ScenePart } from '../types/robotics';
import { timeSlicer } from './yieldToMain';
import type { ProjectSettings } from '../types/robotics';
import { sceneWorldAssets, worldAssetJson } from '../cases/worldAssets';
import type { StudyRecord, StudyRow, StudyKnob } from '../study/types';

const partJson = new WeakMap<ScenePart, string>();
const studyBaseJson = new WeakMap<StudyRecord['base'], Promise<string>>();
const studyRowJson = new WeakMap<StudyRow, string>();
const studyKnobJson = new WeakMap<StudyKnob[], string>();

function cachedJson<T extends object>(value: T, cache: WeakMap<T, string>): string {
  const saved = cache.get(value);

  if (saved !== undefined) return saved;

  const json = JSON.stringify(value);

  cache.set(value, json);

  return json;
}

async function partsJson(parts: ScenePart[]): Promise<string> {
  const breathe = timeSlicer();
  const items: string[] = [];

  for (const part of parts) {
    await breathe();
    items.push(cachedJson(part, partJson));
  }

  return `[${items.join(',')}]`;
}

function studyBaselineJson(base: StudyRecord['base']): Promise<string> {
  const saved = studyBaseJson.get(base);

  if (saved) return saved;

  const pending = partsJson(base.parts).then((parts) => `{"parts":${parts},"project":${JSON.stringify(base.project)}}`);

  studyBaseJson.set(base, pending);

  return pending;
}

async function projectJson(project: ProjectSettings): Promise<string> {
  const { study, ...settings } = project;

  if (!study) return JSON.stringify(project);

  const { base, knobs, rows, current, ...results } = study;
  const baseline = await studyBaselineJson(base);
  const details = JSON.stringify(results);
  const head = JSON.stringify(settings);

  const outcomes = rows.map((row) => cachedJson(row, studyRowJson)).join(',');
  const studyJson = `${details.slice(0, -1)},"knobs":${cachedJson(knobs, studyKnobJson)},"current":${cachedJson(current, studyRowJson)},"rows":[${outcomes}],"base":${baseline}}`;
  const fields = [head.slice(1, -1), `"study":${studyJson}`].filter(Boolean).join(',');

  return `{${fields}}`;
}

export async function sceneJson(payload: { parts: ScenePart[] } & Record<string, unknown>): Promise<string> {
  const { parts, project, history, ...rest } = payload;
  const items = await partsJson(parts);
  const settings = project ? `"project":${await projectJson(project as ProjectSettings)}` : '';
  const assets = sceneWorldAssets(project as ProjectSettings | undefined);
  const assetEntries = Object.entries(assets).map(
    ([hash, asset]) => `${JSON.stringify(hash)}:${worldAssetJson(asset)}`,
  );
  const metadata = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'worldAssets'));
  const head = JSON.stringify(metadata);
  const fields = [head.slice(1, -1), settings, `"parts":${items}`].filter(Boolean).join(',');
  const assetsJson = assetEntries.length ? `,"worldAssets":{${assetEntries.join(',')}}` : '';

  const historyJson = typeof history === 'string' ? `,"history":${await historyLiteral(history)}` : '';

  return `{${fields}${assetsJson}${historyJson}}`;
}
