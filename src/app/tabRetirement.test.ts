import { afterEach, expect, it, vi } from 'vitest';
import { closedSeed, retireTabs } from './tabRetirement';
import type { WorkspaceHandle, WorkspaceMeta, WorkspaceSeed } from '../SceneWorkspace';
import { platformBridge } from '../utils/platformBridge';
import { versionOperation } from '../workspace/versionOperations';
import { readVersionGraph, restoreVersion } from '../workspace/sceneVersions';
import { versionPart, versionScene } from '../workspace/sceneVersions.fixtures';

vi.mock('../utils/platformBridge', () => ({ platformBridge: { closeAcpWorkspace: vi.fn() } }));

afterEach(() => vi.resetAllMocks());

const meta: WorkspaceMeta = {
  sceneId: 'arm',
  name: 'Arm',
  partCount: 1,
  busy: true,
  activity: '',
  chatId: 'chat-a',
  chatIds: ['chat-a'],
  pristine: false,
};

it('reopens the final durable agent checkpoint instead of the pre-flush history snapshot', async () => {
  const initial = versionScene([versionPart('arm')]);
  const edited = versionScene([versionPart('arm', 20)]);
  const begun = await versionOperation({
    action: 'begin',
    scene: JSON.stringify(initial),
    run: 'workspace',
    chatId: 'chat-a',
  });
  let history = begun.history;
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seed = (): WorkspaceSeed => ({ ...edited, sceneId: 'arm', sceneName: 'Arm', history });
  const handle = {
    stopAgent: vi.fn(),
    persistChat: vi.fn(),
    snapshot: seed,
    flush: async () => {
      await pending;

      const finished = await versionOperation({
        action: 'finish',
        scene: JSON.stringify(edited),
        history,
        run: 'workspace',
        selected: ['arm'],
      });

      history = finished.history;
    },
  } as unknown as WorkspaceHandle;
  const tab = { id: 'workspace', seed: seed() };
  const onError = vi.fn();
  const retired = retireTabs({
    closing: [tab],
    list: [tab],
    metas: { workspace: meta },
    handles: new Map([[tab.id, handle]]),
    discard: false,
    onError,
  });

  expect(retired.stoppedAgent).toBe(true);
  expect(handle.stopAgent).toHaveBeenCalledOnce();
  expect(handle.persistChat).toHaveBeenCalledOnce();
  expect(platformBridge.closeAcpWorkspace).toHaveBeenCalledWith(tab.id);
  expect(readVersionGraph(retired.remember[0].seed.history!).activeRuns).toEqual({ workspace: begun.head });

  const reopening = closedSeed(retired.remember[0]);

  release();

  const reopened = await reopening;
  const graph = readVersionGraph(reopened.history!);

  expect(reopened.sceneId).toBe('arm');
  expect(graph.activeRuns).toEqual({});
  expect(graph.completedRuns![begun.head!].parts).toEqual(['arm']);
  expect(restoreVersion(graph)).toEqual(edited);
  expect(restoreVersion(graph, begun.head!)).toEqual(initial);
  expect(onError).not.toHaveBeenCalled();
});

it('reports a failed close flush and retains the in-memory scene for recovery', async () => {
  const seed: WorkspaceSeed = { ...versionScene([versionPart('arm', 20)]), sceneId: 'arm', sceneName: 'Arm' };
  const error = new Error('Disk full');
  const handle = {
    stopAgent: vi.fn(),
    persistChat: vi.fn(),
    snapshot: () => seed,
    flush: vi.fn().mockRejectedValue(error),
  } as unknown as WorkspaceHandle;
  const tab = { id: 'workspace', seed };
  const onError = vi.fn();
  const retired = retireTabs({
    closing: [tab],
    list: [tab],
    metas: { workspace: meta },
    handles: new Map([[tab.id, handle]]),
    discard: false,
    onError,
  });

  expect(await closedSeed(retired.remember[0])).toBe(seed);
  expect(onError).toHaveBeenCalledExactlyOnceWith(error);
});
