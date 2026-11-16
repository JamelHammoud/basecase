import { beforeEach, expect, it, vi } from 'vitest';
import { captureVersion, emptyVersionGraph } from '../../../workspace/sceneVersions';
import { versionPart, versionScene } from '../../../workspace/sceneVersions.fixtures';
import { idbGet, idbGetMany, idbWrite } from './idb';
import { summarizeScene } from './sceneSummary';
import type { VersionedSceneRecord } from '../../../types/sceneHistory';

vi.mock('./idb', () => ({ idbGet: vi.fn(), idbGetMany: vi.fn(), idbWrite: vi.fn() }));

const records = new Map<string, unknown>();
let handlers: typeof import('./webSceneHistory').webSceneHistoryHandlers;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  records.clear();
  handlers = (await import('./webSceneHistory')).webSceneHistoryHandlers;
  vi.mocked(idbGet).mockImplementation(async (store, key) => records.get(`${store}:${key}`));
  vi.mocked(idbGetMany).mockImplementation(async (store, keys) => keys.map((key) => records.get(`${store}:${key}`)));
  vi.mocked(idbWrite).mockImplementation(async (changes) => {
    for (const change of changes) {
      if (change.kind === 'put') records.set(`${change.store}:${change.key}`, change.value);
      else records.delete(`${change.store}:${change.key}`);
    }
  });
});

const saved = (): VersionedSceneRecord => {
  const design = versionScene([versionPart('body'), versionPart('camera')]);
  const graph = captureVersion(emptyVersionGraph(), design, { label: 'Camera baseline', at: '2026-11-16' });

  return { ...design, id: 'arm', name: 'Arm', partCount: 2, updatedAt: '2026-11-16', history: JSON.stringify(graph) };
};

it('stores shared immutable blocks once for linked scenes and commits the reference with the scene', async () => {
  const first = saved();

  await handlers.save({ record: first, summary: summarizeScene(first) });

  const blocks = [...records.keys()].filter((key) => key.includes('/content/'));
  const other = { ...first, id: 'arm-copy', name: 'Arm copy' };

  await handlers.save({ record: other, summary: summarizeScene(other) });

  expect([...records.keys()].filter((key) => key.includes('/content/'))).toEqual(blocks);
  expect(records.get('scenes:arm')).not.toHaveProperty('history');
  expect(JSON.parse((await handlers.load('arm')).result!)).toEqual(JSON.parse(first.history!));
  expect(JSON.parse((await handlers.load('arm-copy')).result!)).toEqual(JSON.parse(first.history!));
  expect(
    vi
      .mocked(idbWrite)
      .mock.calls[0][0].slice(-3)
      .map((change) => change.store),
  ).toEqual(['scenes', 'sceneSummaries', 'settings']);
});

it('does not publish a new head when the transaction aborts', async () => {
  const first = saved();

  await handlers.save({ record: first, summary: summarizeScene(first) });

  const reference = records.get('settings:scene-history/ref/arm');
  const graph = captureVersion(JSON.parse(first.history!), versionScene([versionPart('body')]), {
    label: 'One part',
    at: '2026-11-16',
  });
  const next = { ...first, history: JSON.stringify(graph), parts: [versionPart('body')] };

  vi.mocked(idbWrite).mockRejectedValueOnce(new Error('Interrupted transaction'));

  await expect(handlers.save({ record: next, summary: summarizeScene(next) })).rejects.toThrow(
    'Interrupted transaction',
  );
  expect(records.get('settings:scene-history/ref/arm')).toBe(reference);
  expect(JSON.parse((await handlers.load('arm')).result!)).toEqual(JSON.parse(first.history!));
});

it('refuses corrupt blocks and forged content references before restoring', async () => {
  const first = saved();

  await handlers.save({ record: first, summary: summarizeScene(first) });

  const key = [...records.keys()].find((entry) => entry.includes('/content/'))!;

  records.set(key, new Blob(['changed']));

  await expect(handlers.load('arm')).rejects.toThrow();
  records.set('settings:scene-history/ref/arm', '../escape');

  await expect(handlers.load('arm')).rejects.toThrow();
});
