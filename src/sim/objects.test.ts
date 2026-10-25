import loadMujoco from '@mujoco/mujoco';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { measureTriangles } from '../three/meshMeasure';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { SimEngine } from './engine';
import { buildMjcf, simDeltas } from './mjcf';

const box = (id: string, y: number, size: number, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y, 0],
  rotation: [0, 0, 0],
  dimensions: { width: size, height: size, depth: size },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const cube = (size: number) =>
  new Float32Array(new THREE.BoxGeometry(size, size, size).toNonIndexed().getAttribute('position').array);

function model(parts: ScenePart[]) {
  const measures = Object.fromEntries(parts.map((p) => [p.id, measureTriangles(cube(p.dimensions.width))]));

  return buildMjcf({
    parts,
    rig: buildRig([], parts),
    project: DEFAULT_PROJECT,
    measures,
    partTriangles: (id) => cube(parts.find((p) => p.id === id)!.dimensions.width),
  });
}

describe('loose objects in the sim', () => {
  it('drops a weighed object onto a fixed table and keeps grouped parts as one body', async () => {
    const group = { id: 'mug', name: 'Mug' };
    const parts = [
      box('table', 50, 100),
      box('mug-body', 300, 40, { massG: 300, group, physics: { dynamic: true, friction: 0.6 } }),
      box('mug-handle', 300, 10, { massG: 20, group, physics: { dynamic: true, friction: 0.6 } }),
    ];
    const sim = model(parts);

    expect(sim.bodies).toHaveLength(1);
    expect(sim.bodies[0].parts).toEqual(['mug-body', 'mug-handle']);
    expect(sim.xml).toContain('friction="0.6 0.02 0.002"');
    expect(sim.xml).toMatch(/<geom name="g_table"[^>]*contype="0" conaffinity="1"/);

    const mj = await loadMujoco();
    const engine = new SimEngine(mj, sim);

    engine.step(1.5);

    const moved = simDeltas(sim, engine.poses()).get('mug-body')!;
    const y = new THREE.Vector3(...parts[1].position).applyMatrix4(moved).y;

    engine.dispose();
    expect(y).toBeGreaterThan(115);
    expect(y).toBeLessThan(125);
  });
});
