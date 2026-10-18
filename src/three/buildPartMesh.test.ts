import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PartKind, ScenePart } from '../types/robotics';
import { buildPartGroup, releasePartGroup } from './buildPartMesh';
import { sharedEntryCount } from './partMesh/sharedGeometry';

const part = (kind: PartKind, extra: Partial<ScenePart> = {}): ScenePart => ({
  id: `p-${kind}`,
  name: kind,
  kind,
  category: 'primitives',
  role: 'solid',
  position: [10, 20, 30],
  rotation: [0, 90, 0],
  dimensions: { width: 40, height: 20, depth: 30 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const cube = (): NonNullable<ScenePart['cad']> => ({
  language: 'openscad',
  code: 'cube(10);',
  positions: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3],
  edges: [],
  originOffset: [0, 0, 0],
  baseSize: [10, 10, 10],
});

const meshes = (group: THREE.Object3D) => {
  const found: THREE.Mesh[] = [];

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) found.push(o);
  });

  return found;
};

const PLAIN_KINDS: PartKind[] = [
  'box',
  'cube',
  'cylinder',
  'tube',
  'sphere',
  'wedge',
  'torus',
  'cone',
  'pyramid',
  'hex_prism',
  'capsule',
  'dome',
  'sculpt_mesh',
  'custom_model',
  'image_plane',
  'servo',
  'stepper_motor',
  'hinge_joint',
  'linear_actuator',
  'l_bracket',
  'u_bracket',
  'beam',
  'standoff',
  'wheel',
  'gripper',
  'bearing_block',
];

describe('buildPartGroup', () => {
  it.each(PLAIN_KINDS)('builds a %s with meshes, its transform and part id', (kind) => {
    const group = buildPartGroup(part(kind), false);

    expect(meshes(group).length).toBeGreaterThan(0);
    expect(group.position.toArray()).toEqual([10, 20, 30]);
    expect(group.rotation.y).toBeCloseTo(Math.PI / 2);
    meshes(group).forEach((m) => expect(m.userData.partId).toBe(`p-${kind}`));
  });

  it('builds hardware from its spec', () => {
    const screw = part('hardware', { hardware: { type: 'socket_head', size: 'M3', length: 10 } });

    expect(meshes(buildPartGroup(screw, false)).length).toBeGreaterThan(0);
  });

  it('shares derived CAD geometry between builds and frees it on release', () => {
    const cad = cube();
    const before = sharedEntryCount();
    const a = buildPartGroup(part('cad_part', { cad }), false, { shareGeometry: true });
    const b = buildPartGroup(part('cad_part', { cad }), true, { shareGeometry: true });

    expect(meshes(a)[0].geometry).toBe(meshes(b)[0].geometry);
    expect(sharedEntryCount()).toBeGreaterThan(before);

    releasePartGroup(a);
    releasePartGroup(b);

    expect(sharedEntryCount()).toBe(before);
  });

  it('scales CAD geometry to the part size', () => {
    const group = buildPartGroup(part('cad_part', { cad: cube() }), false);
    const box = new THREE.Box3().setFromObject(meshes(group)[0]);
    const size = box.getSize(new THREE.Vector3());

    expect([size.x, size.y, size.z].map(Math.round).sort()).toEqual([20, 30, 40]);
  });

  it('highlights a selected part', () => {
    const material = (selected: boolean) =>
      meshes(buildPartGroup(part('box'), selected))[0].material as THREE.MeshStandardMaterial;

    expect(material(true).emissive.getHex()).not.toBe(material(false).emissive.getHex());
  });
});
