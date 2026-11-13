import { describe, expect, it, vi } from 'vitest';
import { galleryBundles } from '../gallery/galleryEntries';
import type { WorkspaceSeed } from '../workspace/types';
import type { SavedSceneSummary } from '../types/robotics';
import { FIRST_ROBOT, seedFromBundle } from './firstLaunch';
import { launchTabs, type StoredOpenScenes } from './openScenes';

const rover = seedFromBundle(galleryBundles().find((b) => b.slug === FIRST_ROBOT)!);

const saved = (id: string): WorkspaceSeed => ({
  sceneId: id,
  sceneName: id,
  globalGoal: '',
  parts: [],
  annotations: [],
});

const summary = (id: string): SavedSceneSummary => ({ id, name: id, globalGoal: '', updatedAt: '', partCount: 1 });

function launch(stored: StoredOpenScenes, library: Record<string, WorkspaceSeed>) {
  const firstRobot = vi.fn(async () => rover);
  const tabs = launchTabs({
    stored,
    loadSeed: async (id) => library[id] ?? null,
    listScenes: async () => Object.keys(library).map(summary),
    firstRobot,
  });

  return { tabs, firstRobot };
}

const NOTHING_OPEN: StoredOpenScenes = { ids: [], tabIds: [], active: 0 };

describe('first launch', () => {
  it('opens the rover on a fresh profile', async () => {
    const { tabs } = launch(NOTHING_OPEN, {});
    const { tabs: list } = await tabs;

    expect(list).toHaveLength(1);
    expect(list[0].seed?.playCase).toBe('reach-the-flag');
    expect(list[0].seed?.parts.length).toBeGreaterThan(0);
    expect(list[0].seed?.blank).toBeUndefined();
  });

  it('opens an empty canvas once the profile has saved scenes', async () => {
    const { tabs, firstRobot } = launch(NOTHING_OPEN, { 'scene-a': saved('scene-a') });
    const { tabs: list } = await tabs;

    expect(firstRobot).not.toHaveBeenCalled();
    expect(list[0].seed?.blank).toBe(true);
  });

  it('restores open tabs instead', async () => {
    const stored = { ids: ['scene-a'], tabIds: ['main'], active: 0 };
    const { tabs, firstRobot } = launch(stored, { 'scene-a': saved('scene-a') });
    const { tabs: list } = await tabs;

    expect(firstRobot).not.toHaveBeenCalled();
    expect(list.map((t) => t.seed?.sceneId)).toEqual(['scene-a']);
  });

  it('stays fresh when the first scene was closed without being saved', async () => {
    const stored = { ids: [rover.sceneId], tabIds: ['main'], active: 0 };
    const { tabs } = launch(stored, {});
    const { tabs: list } = await tabs;

    expect(list[0].seed?.playCase).toBe('reach-the-flag');
  });

  it('opens an empty canvas when the library can’t be read', async () => {
    const list = await launchTabs({
      stored: NOTHING_OPEN,
      loadSeed: async () => null,
      listScenes: () => Promise.reject(new Error('offline')),
      firstRobot: async () => rover,
    });

    expect(list.tabs[0].seed?.blank).toBe(true);
  });

  it('carries the rover’s joints and its Case into the scene', () => {
    expect(rover.project?.joints?.length).toBeGreaterThan(0);
    expect(rover.project?.cases?.map((c) => c.id)).toEqual(['reach-the-flag']);
    expect(rover.sceneName).toBe('Reach the Flag: Two-wheel rover');
  });
});
