import { afterEach, expect, it, vi } from 'vitest';
import { openVersionBranch } from './sceneBranches';
import { captureVersion, emptyVersionGraph, readVersionGraph, restoreVersion } from '../workspace/sceneVersions';
import { versionPart, versionScene } from '../workspace/sceneVersions.fixtures';
import { sceneStore } from '../utils/sceneStore';
import { platformBridge } from '../utils/platformBridge';

vi.mock('../utils/platformBridge', () => ({ platformBridge: { saveSceneJson: vi.fn() } }));

afterEach(() => {
  sceneStore.set([]);
  vi.resetAllMocks();
});

it('reserves distinct names for simultaneous branches and preserves their linked source', async () => {
  const design = versionScene([versionPart('chassis')]);
  const graph = captureVersion(emptyVersionGraph(), design, { label: 'Sheet chassis', at: '2026-11-16' });
  const history = JSON.stringify(graph);
  const options = { history, id: graph.head!, sceneId: 'source', sceneName: 'Chassis', names: ['Chassis copy'] };

  vi.mocked(platformBridge.saveSceneJson).mockImplementation(async (json) => {
    const record = JSON.parse(json);

    return { ...record, partCount: record.parts.length, updatedAt: '2026-11-16' };
  });

  const branches = await Promise.all([openVersionBranch(options), openVersionBranch(options)]);

  expect(branches.map((branch) => branch.sceneName)).toEqual(['Chassis copy 2', 'Chassis copy 3']);
  expect(new Set(branches.map((branch) => branch.sceneId)).size).toBe(2);

  for (const branch of branches) {
    const linked = readVersionGraph(branch.history!);

    expect(linked.origin).toEqual({ sceneId: 'source', versionId: graph.head });
    expect(restoreVersion(linked)).toEqual(design);
  }

  expect(readVersionGraph(history)).toEqual(graph);
});
