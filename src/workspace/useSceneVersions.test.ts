import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { useSceneVersions, type VersionOptions, type SceneVersions } from './useSceneVersions';
import { versionPart, versionScene } from './sceneVersions.fixtures';
import { readVersionGraph, restoreVersion, type VersionScene } from './sceneVersions';
import { platformBridge } from '../utils/platformBridge';
import { sceneStore } from '../utils/sceneStore';
import type { SavedSceneSummary } from '../types/robotics';

vi.mock('../utils/platformBridge', () => ({ platformBridge: { saveSceneJson: vi.fn() } }));

afterEach(() => {
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
