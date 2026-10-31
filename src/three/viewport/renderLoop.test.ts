import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { measuresIn } from '../analysis/analysisPool';
import { snapshotShapes } from '../analysis/sceneShapes';
import { PartLayer } from './partLayer';
import { RenderLoop } from './renderLoop';
import type { Stage } from './stage';

const lid: ScenePart = {
  id: 'lid',
  name: 'Lid',
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 68, height: 10, depth: 33 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
};

describe('spawn animation', () => {
  it('finishes before a measurement, so checks never see a part mid pop-in', async () => {
    const root = new THREE.Group();
    const layer = new PartLayer(root);

    layer.sync([lid], new Set(), 0);
    layer.buildPending();

    const loop = new RenderLoop({} as unknown as Stage, (id) => layer.get(id));
    const group = layer.get('lid')!;

    loop.spawns.set('lid', performance.now());
    group.scale.setScalar(0.5);
    loop.finishSpawns();

    const measured = await measuresIn(snapshotShapes([{ id: 'lid', object: group }]));
    const { min, max } = measured.lid;

    expect(loop.spawns.size).toBe(0);
    expect(max.map((v, i) => Math.round(v - min[i]))).toEqual([68, 10, 33]);
  });
});
