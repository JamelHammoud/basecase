import { describe, expect, it } from 'vitest';
import { interferenceIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { buildPartGroup } from '../three/buildPartMesh';
import type { ScenePart } from '../types/robotics';
import { designedFits } from './designedFits';

const part = (id: string, o: Partial<ScenePart>): ScenePart => ({
  id,
  name: id,
  kind: 'cad_part',
  category: 'structure',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#eeeeee',
  note: '',
  visible: true,
  locked: false,
  ...o,
});

const boss = (holeMm: number) =>
  part('boss', { kind: 'tube', dimensions: { width: 10, height: 10, depth: 10, thickness: (10 - holeMm) / 2 } });
const insert = part('insert', {
  kind: 'hardware',
  hardware: { type: 'heat_insert', size: 'M3', length: 5.7 },
  dimensions: { width: 4.6, height: 5.7, depth: 4.6 },
});

async function checkScene(parts: ScenePart[]) {
  const objects = parts.map((p) => ({ id: p.id, object: buildPartGroup(p, false) }));
  const found = await interferenceIn(snapshotShapes(objects), { toleranceMm: 0.3, maxSamples: 400 });

  return designedFits(found, parts);
}

describe('check_scene fits', () => {
  it('accepts a heat-set insert pressed into its datasheet hole', async () => {
    expect(await checkScene([boss(4), insert])).toEqual({ items: [], coplanar: [] });
  });

  it('reports an insert hole smaller than the datasheet asks for', async () => {
    const { items } = await checkScene([boss(3.6), insert]);

    expect(items.map((i) => i.insert)).toEqual([{ id: 'insert', holeMm: 3.6, needMm: 4 }]);
  });
});
