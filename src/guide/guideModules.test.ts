import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { buildModules } from './guideModules';
import type { Box, GuideScene } from './guideTypes';

function fixture(count: number): GuideScene {
  const parts: ScenePart[] = [];
  const boxes: Record<string, Box> = {};

  for (let group = 0; group < count; group++) {
    const y = ((group * 37) % count) * 100;

    for (let member = 0; member < 3; member++) {
      const id = `${group}-${member}`;
      const x = [0, 10, 30][member];

      parts.push({
        id,
        name: id,
        kind: 'box',
        category: 'structure',
        role: 'solid',
        position: [x, y, 0],
        rotation: [0, 0, 0],
        dimensions: { width: 2, height: 2, depth: 2 },
        color: '#eeeeee',
        note: '',
        visible: true,
        locked: false,
        group: { id: String(group), name: `Assembly ${group}` },
      });
      boxes[id] = { min: [x - 1, y - 1, -1], max: [x + 1, y + 1, 1] };
    }
  }

  return { title: 'Modules', parts, boxes, joints: [], contacts: {}, axes: {} };
}

describe('build guide module geometry', () => {
  it.each([100, 200])('bounds geometry reads for %i repeated modules', (count) => {
    const scene = fixture(count);
    const before = structuredClone(scene);
    let reads = 0;
    const boxes = new Proxy(scene.boxes, {
      get(target, key: string) {
        reads += 1;

        return target[key];
      },
    });
    const modules = buildModules({ ...scene, boxes }, scene.parts);

    expect(modules).toHaveLength(count + 1);
    expect(modules[1]).toMatchObject({ id: 'module:0', copies: count });
    expect(modules.slice(2).every((m) => m.repeatOf === 'module:0' && m.mirrored === false)).toBe(true);
    expect(modules.slice(1).map((m) => scene.boxes[m.partIds[0]].min[1])).toEqual(
      Array.from({ length: count }, (_, i) => i * 100 - 1),
    );
    expect(reads).toBeLessThanOrEqual(scene.parts.length * 3);
    expect(scene).toEqual(before);
  });

  it('keeps height and name ordering, translated copies and mirrored layouts', () => {
    const scene = fixture(4);

    scene.parts.forEach((part) => {
      const group = Number(part.group!.id);

      part.group = { id: String(group), name: ['Zulu', 'Alpha', 'Beta', 'Lower'][group] };

      if (group === 3) return;

      const box = scene.boxes[part.id];
      const x = group === 2 ? -part.position[0] : part.position[0] + group * 100;

      box.min = [x - 1, 499, -1];
      box.max = [x + 1, 501, 1];
    });

    const modules = buildModules(scene, scene.parts);

    expect(modules.map((m) => m.name)).toEqual(['', 'Lower', 'Alpha', 'Beta', 'Zulu']);
    expect(modules[1]).toMatchObject({ copies: 3 });
    expect(modules[2]).toMatchObject({ repeatOf: 'module:3', mirrored: false });
    expect(modules[3]).toMatchObject({ repeatOf: 'module:3', mirrored: true });
    expect(modules[4]).toMatchObject({ repeatOf: 'module:3', mirrored: false });
  });

  it('reads edited boxes on the next call and restores the same plan after undo', () => {
    const scene = fixture(3);
    const before = buildModules(scene, scene.parts);
    const boxes = structuredClone(scene.boxes);

    for (const part of scene.parts.filter((p) => p.group!.id === '2')) {
      scene.boxes[part.id].min[1] -= 500;
      scene.boxes[part.id].max[1] -= 500;
    }

    scene.boxes['2-0'].min[0] -= 40;

    const after = buildModules(scene, scene.parts);

    expect(after.map((m) => m.id)).toEqual(['main', 'module:2', 'module:0', 'module:1']);
    expect(after[2]).toMatchObject({ repeatOf: 'module:2', mirrored: true });
    expect(buildModules({ ...scene, boxes }, scene.parts)).toEqual(before);
  });

  it('orders joint-defined modules and shares their repeated layouts', () => {
    const scene = fixture(4);

    scene.joints = Array.from({ length: 4 }, (_, i) => ({
      id: `joint-${i}`,
      name: `arm-${i}`,
      type: 'revolute',
      limb: 'arm',
      parent: [],
      child: scene.parts.filter((p) => p.group!.id === String(i)).map((p) => p.id),
      origin: [0, 0, 0],
      axis: [1, 0, 0],
    }));

    const modules = buildModules(scene, scene.parts);

    expect(modules.map((m) => m.id)).toEqual(['main', ...scene.joints.map((j) => `module:${j.id}`)]);
    expect(modules[1].copies).toBe(4);
    expect(modules.slice(2).every((m) => m.repeatOf === 'module:joint-0' && m.mirrored === false)).toBe(true);
  });

  it('does not read geometry for layouts without a matching signature', () => {
    const scene = fixture(4);
    let reads = 0;
    const boxes = new Proxy(scene.boxes, {
      get(target, key: string) {
        reads += 1;

        return target[key];
      },
    });

    scene.parts.forEach((part) => {
      part.dimensions.width += Number(part.group!.id);
    });

    const modules = buildModules({ ...scene, boxes }, scene.parts);

    expect(modules.every((m) => m.copies === 1 && m.repeatOf === undefined)).toBe(true);
    expect(reads).toBeLessThanOrEqual(scene.parts.length * 2);
  });

  it('keeps missing-box fallbacks and folds small groups into the main module', () => {
    const scene = fixture(4);

    scene.parts = scene.parts.filter((p) => p.id !== '3-2');
    delete scene.boxes['0-0'];
    delete scene.boxes['0-1'];
    delete scene.boxes['0-2'];
    delete scene.boxes['1-0'];

    const modules = buildModules(scene, scene.parts);

    expect(modules.map((m) => m.id)).toEqual(['main', 'module:0', 'module:1', 'module:2']);
    expect(modules[0].partIds).toEqual(['3-0', '3-1']);
    expect(modules[1].copies).toBe(1);
    expect(modules.slice(2).every((m) => m.repeatOf === 'module:0' && m.mirrored)).toBe(true);
    expect(buildModules({ ...scene, parts: [], boxes: {} }, [])).toEqual([
      { id: 'main', name: '', parent: null, partIds: [], copies: 1 },
    ]);
  });
});
