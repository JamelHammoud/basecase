import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { simreadyVisual } from './simreadyVisuals';

const { parseAsync } = vi.hoisted(() => ({ parseAsync: vi.fn() }));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parseAsync = parseAsync;
  },
}));

afterEach(() => vi.restoreAllMocks());

function part(key: string, node: string): ScenePart {
  return {
    id: node,
    name: node,
    kind: 'mesh',
    category: 'structure',
    role: 'solid',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 1, height: 1, depth: 1 },
    color: '#888888',
    note: '',
    visible: true,
    locked: false,
    mesh: {
      positions: [],
      indices: [],
      baseSize: [1, 1, 1],
      visual: { key, node, matrix: new THREE.Matrix4().toArray() },
    },
  };
}

it.each([300, 600])('groups %i visual pieces without replacing growing node lists', async (count) => {
  const scene = new THREE.Group();
  const body = new THREE.Group();
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const nested = new THREE.Group();
  const geometry = new THREE.BoxGeometry(2, 3, 4);
  const materials = Array.from({ length: count }, () => new THREE.MeshStandardMaterial());

  body.name = 'body';
  body.position.set(2, 3, 4);
  nested.position.set(-5, 6, 7);
  other.name = 'other';
  body.add(nested);
  nested.add(...materials.map((material) => new THREE.Mesh(geometry, material)));
  scene.add(body, other);
  parseAsync.mockResolvedValue({ scene });
  vi.spyOn(platformBridge, 'simreadyFile').mockResolvedValue(new Uint8Array([1, 2, 3]));

  const writes = vi.spyOn(Map.prototype, 'set');
  const source = part(`visual-${count}`, 'body');

  expect(simreadyVisual(source)).toBeNull();

  await vi.waitFor(() => expect(simreadyVisual(source)).toHaveLength(count));

  const pieces = simreadyVisual(source)!;
  const groups = writes.mock.calls.filter(
    ([key, value]) => (key === 'body' || key === 'other') && Array.isArray(value),
  );
  const expected = geometry.clone().applyMatrix4(nested.matrixWorld);

  expect(groups).toHaveLength(2);
  expect(groups[0][1]).toBe(pieces);
  expect(pieces.map((piece) => piece.material)).toEqual(materials);

  for (const piece of pieces) {
    expect(piece.geometry.attributes.position.array).toEqual(expected.attributes.position.array);
    expect(piece.geometry).not.toBe(geometry);
    expect(piece.geometry.userData.shared).toBe(true);
  }

  expect(simreadyVisual(part(source.mesh!.visual!.key, 'other'))).toHaveLength(1);
  expect(simreadyVisual(part(source.mesh!.visual!.key, 'missing'))).toBeNull();
  expect(simreadyVisual(source)).toBe(pieces);
  expect(platformBridge.simreadyFile).toHaveBeenCalledTimes(1);
  expect(geometry.attributes.position.array).toEqual(new THREE.BoxGeometry(2, 3, 4).attributes.position.array);
});
