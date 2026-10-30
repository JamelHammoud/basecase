import { describe, expect, it } from 'vitest';
import { assemblyIn, fastenersIn, interferenceIn, measuresIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import type { ScenePart } from '../types/robotics';
import { designedFits } from '../utils/designedFits';
import { bracket, objectsOf, printed } from './assembly.fixtures';
import { fastenerInput } from './fastenerSpec';
import { heldBy } from './heldBy';
import { twinDifferences } from './twinLint';

async function fits(parts: ScenePart[]) {
  const scene = snapshotShapes(objectsOf(parts));
  const [found, chains] = await Promise.all([
    interferenceIn(scene, { toleranceMm: 0.3, maxSamples: 400 }),
    fastenersIn(scene, fastenerInput(parts)),
  ]);

  return designedFits(found, parts, chains);
}

const moved = (parts: ScenePart[], id: string, dx: number) =>
  parts.map((p) =>
    p.id === id ? { ...p, position: [p.position[0] + dx, p.position[1], p.position[2]] } : p,
  ) as ScenePart[];

describe('check_scene with fastener chains', () => {
  it('reports no screw or insert sitting in its own stack', async () => {
    expect((await fits(bracket())).items).toEqual([]);
  });

  it('still reports a screw that cuts into the wall of its hole', async () => {
    const { items } = await fits(moved(bracket(), 'screw-1', 2.5));

    expect(items.map((i) => [i.a, i.b].sort())).toContainEqual(['plate', 'screw-1']);
  });
});

describe('twin-difference lint', () => {
  const pair = (rightHeight: number) => [
    ...bracket({ prefix: 'left-', x: -40 }),
    ...bracket({ prefix: 'right-', x: 40, mirror: true }).map((p) =>
      p.id === 'right-plate' ? { ...p, dimensions: { ...p.dimensions, height: rightHeight } } : p,
    ),
  ];

  async function lint(parts: ScenePart[]) {
    const scene = snapshotShapes(objectsOf(parts));

    return twinDifferences({ parts, clashes: [], measures: await measuresIn(scene) });
  }

  it('is quiet on exact mirrors', async () => {
    expect(await lint(pair(4))).toEqual([]);
  });

  it('flags a twin whose volume and size drifted', async () => {
    const [line] = await lint(pair(6));

    expect(line).toMatch(/^left-plate \/ right-plate aren't mirror twins: volume 50%, size z 4 vs 6 mm/);
  });
});

describe('what holds each part', () => {
  async function held(parts: ScenePart[]) {
    const g = await assemblyIn(snapshotShapes(objectsOf(parts)), {
      ...fastenerInput(parts),
      serviceable: [],
      budgetMs: 20000,
    });

    return heldBy(parts, g);
  }

  it('counts parts clamped by a screw as held', async () => {
    expect((await held(bracket())).unheld).toEqual([]);
  });

  it('flags parts with no fastener, and lists strap notes as unverified', async () => {
    const parts = [
      printed('tray', { size: [40, 4, 30] }, [0, 0, 0]),
      printed('board', { size: [20, 2, 20] }, [0, 4, 0]),
      printed('battery', { size: [20, 10, 20] }, [0, 30, 0], { note: 'Held by a 20 mm hook-and-loop strap.' }),
    ];
    const result = await held(parts);

    expect(result.unheld).toEqual(['tray', 'board']);
    expect(result.declared).toEqual([{ id: 'battery', how: 'hook-and-loop' }]);
  });
});
