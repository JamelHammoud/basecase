import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { useSceneVersions, type VersionOptions, type SceneVersions } from './useSceneVersions';
import { versionPart, versionScene } from './sceneVersions.fixtures';
import { readVersionGraph, restoreVersion, type VersionScene } from './sceneVersions';
import { platformBridge } from '../utils/platformBridge';
import { sceneStore } from '../utils/sceneStore';
import * as versionClient from './versionClient';
import { versionOperation } from './versionOperations';
import { queueSceneWrite } from '../utils/sceneWrites';
import type { SavedSceneSummary } from '../types/robotics';

vi.mock('../utils/platformBridge', () => ({ platformBridge: { saveSceneJson: vi.fn() } }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  sceneStore.set([]);
});

function session() {
  const design = versionScene([versionPart('arm')]);
  const partsRef = { current: design.parts };
  const projectRef = { current: design.project };
  const options = {
    docs: {
      partsRef,
      projectRef,
      commitVersion: vi.fn((parts: VersionScene['parts'], project: VersionScene['project']) => {
        partsRef.current = parts;
        projectRef.current = project;
      }),
    },
    scene: { sceneId: 'arm', sceneName: 'Arm', globalGoal: '', setGlobalGoal: vi.fn() },
    annotations: { annotations: design.annotations, reset: vi.fn() },
    studio: {},
  } as unknown as VersionOptions;
  const result: { current?: SceneVersions } = {};
  const Host = () => {
    result.current = useSceneVersions(options);

    return null;
  };

  renderToStaticMarkup(createElement(Host));

  return { versions: result.current!, design, options };
}

it('publishes a checkpoint only after storage succeeds and keeps the last durable graph after a failed write', async () => {
  const { versions, design } = session();

  vi.mocked(platformBridge.saveSceneJson).mockImplementation(async (json) => {
    const record = JSON.parse(json);

    return { ...record, partCount: record.parts.length, updatedAt: '2026-11-16' };
  });

  const saved = await versions.capture('Saved arm');

  vi.mocked(platformBridge.saveSceneJson).mockRejectedValueOnce(new Error('Disk full'));

  await expect(versions.begin('lane-a', 'chat-a')).rejects.toThrow('Disk full');
  expect(versions.historyRef.current).toBe(saved.history);
  expect(readVersionGraph(versions.historyRef.current!)).not.toHaveProperty('activeRuns');

  const next = await versions.capture('After failed run');
  const graph = readVersionGraph(next.history);

  expect(Object.values(graph.versions).map((version) => version.label)).toEqual(['Saved arm', 'After failed run']);
  expect(restoreVersion(graph)).toEqual(design);
});

it('does not publish a checkpoint when the scene was deleted before its queued write', async () => {
  const { versions } = session();

  vi.mocked(platformBridge.saveSceneJson).mockResolvedValueOnce(null as unknown as SavedSceneSummary);

  await expect(versions.capture('Deleted arm')).rejects.toThrow('Open the original scene');
  expect(versions.historyRef.current).toBeUndefined();
});

it('captures a lane baseline after preceding serialized design work and refuses requests invalidated by a scene reset', async () => {
  const { versions, options } = session();

  vi.mocked(platformBridge.saveSceneJson).mockImplementation(async (json) => {
    const record = JSON.parse(json);

    return { ...record, partCount: record.parts.length, updatedAt: '2026-11-16' };
  });

  const preceding = versions.serialize(async () => {
    options.docs.partsRef.current = [versionPart('arm', 20)];
  });
  const baseline = versions.begin('lane-a');

  await preceding;

  const saved = await baseline;
  const graph = readVersionGraph(saved.history);

  expect(restoreVersion(graph, saved.activeRuns['lane-a']).parts[0].position[0]).toBe(20);

  const outdated = versions.capture('Before reset');

  versions.reset();

  await expect(outdated).rejects.toThrow('Open the original scene');
  expect(versions.historyRef.current).toBeUndefined();
  expect(platformBridge.saveSceneJson).toHaveBeenCalledTimes(1);
});

it('applies a restored design before a queued lane captures its baseline', async () => {
  const { versions, options } = session();

  vi.mocked(platformBridge.saveSceneJson).mockImplementation(async (json) => {
    const record = JSON.parse(json);

    return { ...record, partCount: record.parts.length, updatedAt: '2026-11-16' };
  });

  const original = await versions.capture('Original arm');

  options.docs.partsRef.current = [versionPart('arm', 20)];

  const restoring = versions.restore(original.head!);
  const beginning = versions.begin('lane-a');

  await restoring;

  const baseline = await beginning;
  const graph = readVersionGraph(baseline.history);

  expect(restoreVersion(graph, baseline.activeRuns['lane-a']).parts[0].position[0]).toBe(0);
  expect(options.docs.partsRef.current[0].position[0]).toBe(0);
  expect(original.rows.every((row) => graph.versions[row.id])).toBe(true);
});

it('retains edits made during checkpoint preparation in the working record while preserving the captured version', async () => {
  const { versions, options, design } = session();
  const edited = [versionPart('arm', 20)];

  vi.spyOn(versionClient, 'versionRequest').mockImplementationOnce(async (request) => {
    const captured = await versionOperation(request);

    await queueSceneWrite('arm', async () => {
      options.docs.partsRef.current = edited;

      return platformBridge.saveSceneJson(JSON.stringify({ id: 'arm', parts: edited }));
    });

    return captured;
  });
  vi.mocked(platformBridge.saveSceneJson).mockImplementation(async (json) => {
    const record = JSON.parse(json);

    return { ...record, partCount: record.parts.length, updatedAt: '2026-11-16' };
  });

  const captured = await versions.capture('Before edit');
  const stored = JSON.parse(vi.mocked(platformBridge.saveSceneJson).mock.lastCall![0]);

  expect(stored.parts).toEqual(edited);
  expect(options.docs.partsRef.current).toBe(edited);
  expect(restoreVersion(readVersionGraph(stored.history))).toEqual(design);
  expect(captured.captured.parts).toBe(design.parts);
});

it('refuses a stale restore before it writes or replaces the newer working design', async () => {
  const { versions, options } = session();

  vi.mocked(platformBridge.saveSceneJson).mockImplementation(async (json) => {
    const record = JSON.parse(json);

    return { ...record, partCount: record.parts.length, updatedAt: '2026-11-16' };
  });

  const original = await versions.capture('Original arm');
  const edited = [versionPart('arm', 40)];

  vi.spyOn(versionClient, 'versionRequest').mockImplementationOnce(async (request) => {
    const restored = await versionOperation(request);

    options.docs.partsRef.current = edited;

    return restored;
  });
  await expect(versions.restore(original.head!)).rejects.toThrow('The design changed');
  expect(platformBridge.saveSceneJson).toHaveBeenCalledTimes(1);
  expect(options.docs.partsRef.current).toBe(edited);
  expect(versions.historyRef.current).toBe(original.history);
  expect(options.docs.commitVersion).not.toHaveBeenCalled();
});

it('stores restored goal and annotations with the applied parts and project', async () => {
  const { versions, options } = session();

  vi.mocked(options.scene.setGlobalGoal).mockImplementation((goal) => {
    options.scene.globalGoal = goal;
  });
  vi.mocked(options.annotations.reset).mockImplementation((annotations) => {
    options.annotations.annotations = annotations;
  });
  vi.mocked(platformBridge.saveSceneJson).mockImplementation(async (json) => {
    const record = JSON.parse(json);

    return { ...record, partCount: record.parts.length, updatedAt: '2026-11-16' };
  });

  const original = await versions.capture('Original arm');

  options.scene.globalGoal = 'Carry a camera';
  options.annotations.annotations = [
    { id: 'note', position: [0, 0, 0], partId: 'arm', comments: [], createdAt: '2026-11-16' },
  ];
  options.docs.partsRef.current = [versionPart('arm', 20)];

  await versions.restore(original.head!);

  const stored = JSON.parse(vi.mocked(platformBridge.saveSceneJson).mock.lastCall![0]);

  expect(stored.parts[0].position[0]).toBe(0);
  expect(stored.globalGoal).toBe('');
  expect(stored.annotations).toEqual([]);
  expect(restoreVersion(readVersionGraph(stored.history))).toMatchObject({ globalGoal: '', annotations: [] });
});
