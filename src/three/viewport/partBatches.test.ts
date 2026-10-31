import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { BATCHED_LAYER, PartBatches } from './partBatches';
import { PartLayer } from './partLayer';
import { partRaycaster } from './picking';

const part = (id: string, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 10, height: 10, depth: 10 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const screw = (id: string, x: number): ScenePart =>
  part(id, {
    kind: 'hardware',
    category: 'hardware',
    position: [x, 5, 0],
    color: '#18181b',
    hardware: { type: 'socket_head', size: 'M3', length: 8, finish: 'black', drive: 'hex' },
  });

function scene(parts: ScenePart[], selected: string[] = []) {
  const root = new THREE.Group();
  const batches = new PartBatches();
  const layer = new PartLayer(root, () => {}, batches);
  const world = new THREE.Scene();

  world.add(root);
  batches.attach(world);
  layer.sync(parts, new Set(selected), 0);
  layer.buildPending();
  world.updateMatrixWorld(true);
  batches.sync();

  return { root, batches, layer, world };
}

const meshesOf = (group: THREE.Object3D | undefined) => {
  const meshes: THREE.Mesh[] = [];

  group?.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));

  return meshes;
};

const batchMeshes = (batches: PartBatches) =>
  batches.root.children.filter((c): c is THREE.BatchedMesh => c instanceof THREE.BatchedMesh);

const lineBatches = (batches: PartBatches) =>
  batches.root.children.filter((c): c is THREE.LineSegments => c instanceof THREE.LineSegments);

const meshInstances = (batches: PartBatches) => batchMeshes(batches).reduce((n, b) => n + b.instanceCount, 0);

describe('PartBatches', () => {
  it('draws every copy of a fastener from one batch per material', () => {
    const parts = Array.from({ length: 40 }, (_, i) => screw(`s${i}`, i * 10));
    const { batches, layer } = scene(parts);
    const perScrew = meshesOf(layer.get('s0')).length;

    expect(perScrew).toBeGreaterThan(0);
    expect(meshInstances(batches)).toBe(40 * perScrew);
    expect(batchMeshes(batches).length).toBeLessThanOrEqual(perScrew);
  });

  it('keeps originals out of the main pass but pickable, and selected parts unbatched', () => {
    const { batches, layer } = scene([part('a'), part('b', { position: [30, 0, 0] })], ['b']);
    const a = meshesOf(layer.get('a'))[0];
    const b = meshesOf(layer.get('b'))[0];
    const camera = new THREE.Camera();

    expect(a.layers.test(camera.layers)).toBe(false);
    expect(a.layers.isEnabled(BATCHED_LAYER)).toBe(true);
    expect(b.layers.test(camera.layers)).toBe(true);
    expect(meshInstances(batches)).toBe(1);

    const raycaster = partRaycaster();

    raycaster.set(new THREE.Vector3(0, 0, 50), new THREE.Vector3(0, 0, -1));
    expect(raycaster.intersectObject(layer.get('a')!, true)[0]?.object.userData.partId).toBe('a');
  });

  it('follows moves and poses, and frees instances when parts go', () => {
    const parts = [part('a'), part('b', { position: [30, 0, 0] })];
    const { batches, layer, world } = scene(parts);
    const batch = batchMeshes(batches)[0];
    const matrix = new THREE.Matrix4();
    const moved = { ...parts[0], position: [0, 40, 0] as [number, number, number] };

    layer.sync([moved, parts[1]], new Set(), 0);
    world.updateMatrixWorld(true);
    batches.sync();

    const ys = [0, 1].map((i) => batch.getMatrixAt(i, matrix).elements[13]).sort((p, q) => p - q);

    expect(ys).toEqual([0, 40]);

    layer.sync([], new Set(), 0);
    expect(batches.stats()).toEqual({ batches: 0, instances: 0 });
    expect(batches.root.children).toHaveLength(0);
  });

  it('hides instances of hidden groups and shows originals while unbatched', () => {
    const { batches, layer, world } = scene([part('a')]);
    const group = layer.get('a')!;
    const mesh = meshesOf(group)[0];
    const batch = batchMeshes(batches)[0];

    group.visible = false;
    batches.sync();
    expect(batch.getVisibleAt(0)).toBe(false);

    const during = batches.unbatched(() => ({ main: mesh.layers.isEnabled(0), batch: batches.root.visible }));

    expect(during).toEqual({ main: true, batch: false });
    expect(mesh.layers.isEnabled(0)).toBe(false);
    expect(batches.root.visible).toBe(true);
    world.remove(batches.root);
  });

  it('copies geometry edited in place and grows past its first buffer', () => {
    const parts = Array.from({ length: 30 }, (_, i) =>
      part(`p${i}`, { kind: 'sphere', position: [i * 20, 0, 0], dimensions: { width: 10 + i, height: 10, depth: 10 } }),
    );
    const { batches, layer } = scene(parts);
    const mesh = meshesOf(layer.get('p0'))[0];
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const batch = batchMeshes(batches).find((b) => b.instanceCount > 0)!;

    position.setX(0, 999);
    position.needsUpdate = true;
    batches.sync();

    const values = batch.geometry.getAttribute('position').array as Float32Array;

    expect(values.includes(999)).toBe(true);
    expect(meshInstances(batches)).toBe(30);
  });

  it('draws every part edge line from one line batch that follows each part', () => {
    const parts = [part('a'), part('b', { position: [30, 0, 0] }), part('c', { position: [60, 0, 0] })];
    const { batches, layer, world } = scene(parts);
    const lines = lineBatches(batches);
    const edges = (id: string) => {
      const found: THREE.LineSegments[] = [];

      layer.get(id)?.traverse((o) => o instanceof THREE.LineSegments && found.push(o));

      return found[0];
    };
    const camera = new THREE.Camera();
    const xs = () => {
      const geometry = lines[0].geometry;
      const ids = geometry.getAttribute('lineInstance').array as Float32Array;

      return [...new Set(Array.from(ids.subarray(0, geometry.drawRange.count)))].length;
    };

    expect(lines).toHaveLength(1);
    expect(xs()).toBe(3);
    expect(edges('a').layers.test(camera.layers)).toBe(false);

    layer.sync([parts[0], { ...parts[1], position: [30, 25, 0] }], new Set(), 0);
    world.updateMatrixWorld(true);
    batches.sync();

    expect(lineBatches(batches)[0]).toBe(lines[0]);
    expect(batches.stats().instances).toBe(4);
  });

  it('reuses the space of replaced geometry instead of growing or re-uploading the batch', () => {
    const sphere = (id: string, width: number, x: number) =>
      part(id, { kind: 'sphere', position: [x, 0, 0], dimensions: { width, height: 10, depth: 10 } });
    const parts = Array.from({ length: 20 }, (_, i) => sphere(`p${i}`, 10, i * 20));
    const { batches, layer } = scene(parts);
    const batch = batchMeshes(batches)[0];
    const buffer = batch.geometry;
    const unused = batch.unusedVertexCount;

    for (let round = 1; round <= 10; round++) {
      layer.sync([sphere('p0', 10 + round, 0), ...parts.slice(1)], new Set(), 0);
      layer.buildPending();
      batches.sync();
    }

    expect(batch.geometry).toBe(buffer);
    expect(batch.unusedVertexCount).toBe(unused);
    expect(meshInstances(batches)).toBe(20);
  });
});
