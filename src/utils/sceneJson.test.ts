import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { sceneJson } from './sceneJson';
import { meshWorldAsset } from '../cases/worldAssets.fixtures';
import { hashWorldAsset, registerWorldAsset, serializeWorldAssets } from '../cases/worldAssets';
import type { ProjectSettings } from '../types/robotics';

const part = (id: string): ScenePart => ({
  id,
  name: `Part “${id}”`,
  kind: 'mesh',
  category: 'structure',
  role: 'solid',
  position: [1.5, 0, -2],
  rotation: [0, 90, 0],
  dimensions: { width: 10, height: 20, depth: 30 },
  color: '#888888',
  note: 'line\nbreak',
  visible: true,
  locked: false,
  mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], baseSize: [1, 1, 1], source: 'test' },
});

describe('sceneJson', () => {
  it('adds referenced worlds once outside the project and reuses their cached serialization', async () => {
    const asset = meshWorldAsset();
    const hash = await hashWorldAsset(asset);
    const project = {
      cases: [{ world: { objects: [], imported: { hash, position: [0, 0, 0] } } }],
    } as unknown as ProjectSettings;

    registerWorldAsset(hash, asset);

    const first = JSON.parse(await sceneJson({ parts: [], project }));
    const second = JSON.parse(await sceneJson({ parts: [], project: { ...project, infillPct: 20 } }));

    expect(first.worldAssets).toEqual(serializeWorldAssets({ [hash]: asset }));
    expect(second.worldAssets).toEqual(first.worldAssets);
    expect(first.project).not.toHaveProperty('worldAssets');
  });

  it('matches JSON.stringify for a scene, and reuses part JSON across saves', async () => {
    const parts = [part('a'), part('b')];
    const payload = { id: 'scene-1', name: 'Robot', parts, project: { budget: 800 }, autosave: true };

    expect(JSON.parse(await sceneJson(payload))).toEqual(JSON.parse(JSON.stringify(payload)));

    const moved = { ...parts[0], position: [9, 9, 9] as [number, number, number] };
    const next = { ...payload, parts: [moved, parts[1]] };

    expect(JSON.parse(await sceneJson(next)).parts[0].position).toEqual([9, 9, 9]);
  });

  it('handles a payload with only parts', async () => {
    expect(JSON.parse(await sceneJson({ parts: [] }))).toEqual({ parts: [] });
  });
});
