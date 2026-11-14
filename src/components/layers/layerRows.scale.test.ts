import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { layerRows } from './layerRows';

function groupedScene() {
  let reads = 0;
  const groups = Array.from({ length: 200 }, (_, i) => ({ id: `group-${i}`, name: `Module ${i}` }));
  const parts: ScenePart[] = [0, 1, 2].flatMap((level) =>
    groups.map((group) => ({
      id: `${group.id}-${level}`,
      name: level === 1 ? 'Servo' : 'Plate',
      kind: 'box',
      category: 'primitives',
      role: 'solid',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: { width: 10, height: 20, depth: 30 },
      color: '#888',
      note: '',
      visible: true,
      locked: false,
      get group() {
        reads++;

        return group;
      },
    })),
  );

  return { parts, groups, reads: () => reads };
}

describe('Layers group indexing', () => {
  it.each([
    { query: '', collapsed: false, levels: [0, 1, 2] },
    { query: '', collapsed: true, levels: [] },
    { query: 'servo', collapsed: true, levels: [1] },
    { query: 'module', collapsed: true, levels: [0, 1, 2] },
  ])('indexes interleaved groups once for $query with collapsed=$collapsed', ({ query, collapsed, levels }) => {
    const scene = groupedScene();
    const closed = new Set(collapsed ? scene.groups.map((group) => group.id) : []);
    const rows = layerRows(scene.parts, closed, query);
    const reads = scene.reads();
    const expected = scene.groups.flatMap((group, i) => [
      { type: 'group', ...group, members: [scene.parts[i], scene.parts[i + 200], scene.parts[i + 400]] },
      ...levels.map((level) => ({ type: 'part', part: scene.parts[i + level * 200], depth: 1 })),
    ]);

    expect(rows).toEqual(expected);
    expect(reads).toBeLessThanOrEqual(scene.parts.length * 8);
  });
});
