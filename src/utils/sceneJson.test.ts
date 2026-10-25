import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { sceneJson } from './sceneJson';

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
