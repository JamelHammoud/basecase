import { checkedSceneHistory } from './sceneHistory.mjs';

export function checkedHistoryHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('The scene history is damaged. Open another saved scene.');

  return value;
}

export function splitSceneHistory(history) {
  const graph = JSON.parse(checkedSceneHistory(history));

  if (!graph || graph.format !== 1 || !graph.content || typeof graph.content !== 'object' || Array.isArray(graph.content))
    throw new Error('The scene history is damaged. Open another saved scene.');

  const blocks = Object.entries(graph.content);

  if (blocks.length > 100000) throw new Error('The scene history is too large. Export a scene copy.');

  for (const [hash, value] of blocks) {
    checkedHistoryHash(hash);

    if (typeof value !== 'string') throw new Error('The scene history is damaged. Open another saved scene.');
  }

  const metadata = { ...graph };

  delete metadata.content;

  const manifest = JSON.stringify({ ...metadata, contentKeys: blocks.map(([hash]) => hash), contentSizes: blocks.map(([, value]) => new TextEncoder().encode(value).byteLength) });

  return { blocks, manifest };
}

export function historyManifest(json) {
  const value = JSON.parse(checkedSceneHistory(json));

  if (!value || !Array.isArray(value.contentKeys) || value.contentKeys.length > 100000)
    throw new Error('The scene history is damaged. Open another saved scene.');

  value.contentKeys.forEach(checkedHistoryHash);

  if (new Set(value.contentKeys).size !== value.contentKeys.length || !Array.isArray(value.contentSizes) || value.contentSizes.length !== value.contentKeys.length)
    throw new Error('The scene history is damaged. Open another saved scene.');

  if (!value.contentSizes.every((size) => Number.isInteger(size) && size >= 0) || value.contentSizes.reduce((sum, size) => sum + size, 0) > 64 * 1024 * 1024)
    throw new Error('The scene history is too large. Export a scene copy.');

  return value;
}

export function assembleSceneHistory(manifest, blocks) {
  const metadata = { ...manifest };

  delete metadata.contentKeys;
  delete metadata.contentSizes;

  return JSON.stringify({ ...metadata, content: Object.fromEntries(blocks) });
}
