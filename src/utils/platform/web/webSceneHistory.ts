import {
  assembleSceneHistory,
  checkedHistoryHash,
  historyManifest,
  splitSceneHistory,
} from '../../../../electron/library/historyFormat.mjs';
import type { VersionedSceneRecord } from '../../../types/sceneHistory';
import type { SavedSceneSummary } from '../../../types/robotics';
import { sha256Hex } from '../../../skills/hash';
import { reply } from '../../workerRpc';
import { idbGet, idbGetMany, idbWrite } from './idb';

const known = new Set<string>();
const contentKey = (hash: string) => `scene-history/content/${checkedHistoryHash(hash)}`;
const referenceKey = (id: string) => `scene-history/ref/${id}`;

type Changes = Parameters<typeof idbWrite>[0];

function checkedBlock(hash: string, value: unknown): string {
  if (typeof value !== 'string' || sha256Hex(value) !== checkedHistoryHash(hash))
    throw new Error('The scene history is damaged. Open another saved scene.');

  return value;
}

async function blockText(hash: string, value: unknown, expectedBytes?: number): Promise<string> {
  if (
    !(value instanceof Blob) ||
    value.size > 64 * 1024 * 1024 ||
    (expectedBytes !== undefined && value.size !== expectedBytes)
  )
    throw new Error('The scene history is damaged. Open another saved scene.');

  return checkedBlock(hash, await value.text());
}

async function save({ record, summary }: { record: VersionedSceneRecord; summary: SavedSceneSummary }) {
  const { history, ...stored } = record;
  const { blocks, manifest } = splitSceneHistory(history!);

  blocks.forEach(([key, value]) => checkedBlock(key, value));

  const hash = sha256Hex(manifest);
  const additions = [...blocks, [hash, manifest] as [string, string]].filter(([key]) => !known.has(key));
  const changes: Changes = additions.map(([key, value]) => ({
    kind: 'put',
    store: 'settings',
    key: contentKey(key),
    value: new Blob([checkedBlock(key, value)]),
  }));

  changes.push(
    { kind: 'put', store: 'scenes', key: record.id, value: stored },
    { kind: 'put', store: 'sceneSummaries', key: record.id, value: summary },
    { kind: 'put', store: 'settings', key: referenceKey(record.id), value: hash },
  );
  await idbWrite(changes);

  if (known.size + additions.length > 100000) known.clear();

  additions.forEach(([key]) => known.add(key));
}

async function load(id: string): Promise<string | undefined> {
  const hash = await idbGet<string>('settings', referenceKey(id));

  if (hash === undefined) return undefined;

  const manifest = historyManifest(await blockText(hash, await idbGet('settings', contentKey(hash))));
  const values = await idbGetMany<Blob>('settings', manifest.contentKeys.map(contentKey));

  for (const [index, value] of values.entries()) {
    if (!(value instanceof Blob) || value.size !== manifest.contentSizes[index])
      throw new Error('The scene history is damaged. Open another saved scene.');
  }

  const blocks = await Promise.all(
    manifest.contentKeys.map(async (key, index): Promise<[string, string]> => [
      key,
      await blockText(key, values[index], manifest.contentSizes[index]),
    ]),
  );

  if (known.size + blocks.length > 100000) known.clear();

  blocks.forEach(([key]) => known.add(key));
  known.add(hash);

  return assembleSceneHistory(manifest, blocks);
}

export const webSceneHistoryHandlers = {
  save: async (payload: { record: VersionedSceneRecord; summary: SavedSceneSummary }) => {
    await save(payload);

    return reply(null);
  },
  load: async (id: string) => reply(await load(id)),
};
