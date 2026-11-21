import * as THREE from 'three';
import { expect, it } from 'vitest';
import { findJointAxis } from '../../joints/axisFinder';
import { jointCandidates } from '../../joints/jointCandidates';
import { MeshIndex } from '../../joints/meshIndex';
import { jointAxesOf, jointAxisOf } from './jointAxis';

function fixture() {
  const shape = new THREE.Shape();

  shape.moveTo(-15, -15);
  shape.lineTo(15, -15);
  shape.lineTo(15, 15);
  shape.lineTo(-15, 15);
  shape.closePath();
  shape.holes.push(new THREE.Path().absarc(0, 0, 4.1, 0, Math.PI * 2, true));

  const geometries = [
    new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -6),
    new THREE.CylinderGeometry(3.9, 3.9, 40, 24).rotateX(Math.PI / 2),
    new THREE.CylinderGeometry(2, 2, 10, 24).translate(50, 0, 0),
  ];
  const positions = geometries.map((geometry) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;

    return Float32Array.from(flat.getAttribute('position').array);
  });
  const matrix = new THREE.Matrix4().makeRotationY(0.4).setPosition(10, 20, 30).toArray();
  const instances = positions.map((_, i) => ({ id: `part-${i}`, key: `axis-selection-${i}`, matrix }));
  const positionsOf = (key: string) => positions[instances.findIndex((instance) => instance.key === key)];
  const bodies = instances.map((instance) => {
    const world = positionsOf(instance.key).slice();
    const point = new THREE.Vector3();
    const transform = new THREE.Matrix4().fromArray(instance.matrix);

    for (let i = 0; i < world.length; i += 3) point.fromArray(world, i).applyMatrix4(transform).toArray(world, i);

    return { id: instance.id, index: new MeshIndex(world) };
  });

  return { instances, positionsOf, bodies };
}

it('keeps requested order, first duplicate matches, missing parts and fresh placements', () => {
  const { instances, positionsOf, bodies } = fixture();
  const duplicate = { ...instances[0], key: 'must-not-load' };
  const source = [...instances, duplicate];
  const ids = ['part-2', 'missing', 'part-0', 'part-1'];
  const expected = jointCandidates([bodies[2], bodies[0], bodies[1]]);

  expect(expected.candidates).not.toHaveLength(0);
  expect(jointAxesOf({ ids, instances: source }, positionsOf)).toEqual(expected);
  expect(jointAxesOf({ ids: ['part-1', 'part-1'], instances: source }, positionsOf)).toEqual(
    jointCandidates([bodies[1], bodies[1]]),
  );

  const pair = { parent: 'part-0', child: 'part-1', instances: source };
  const axis = findJointAxis(bodies[0].index, bodies[1].index);

  expect(axis).not.toBeNull();
  expect(jointAxisOf(pair, positionsOf)).toEqual(axis);
  expect(jointAxisOf({ ...pair, child: 'missing' }, positionsOf)).toBeNull();

  const moved = source.map((instance) => ({
    ...instance,
    matrix: new THREE.Matrix4().fromArray(instance.matrix).setPosition(90, 80, 70).toArray(),
  }));

  expect(jointAxisOf({ ...pair, instances: moved }, positionsOf)).not.toEqual(axis);
  expect(jointAxisOf(pair, positionsOf)).toEqual(axis);
  expect(source).toEqual([...instances, duplicate]);
  expect(ids).toEqual(['part-2', 'missing', 'part-0', 'part-1']);
});

it('reads each scene id once and stops when all requested parts are found', () => {
  const { instances, positionsOf, bodies } = fixture();
  let reads = 0;
  const counted = (id: string) => ({
    get id() {
      reads++;

      return id;
    },
    key: 'must-not-load',
    matrix: [],
  });
  const unrelated = Array.from({ length: 600 }, (_, i) => counted(`other-${i}`));
  const missing = Array.from({ length: 600 }, (_, i) => `missing-${i}`);
  const source = [...unrelated, ...instances];

  expect(jointAxesOf({ ids: [...missing, 'part-1', 'part-0'], instances: source }, positionsOf)).toEqual(
    jointCandidates([bodies[1], bodies[0]]),
  );
  expect(reads).toBe(600);
  reads = 0;
  jointAxisOf({ parent: 'part-0', child: 'part-1', instances: [...instances, ...unrelated] }, positionsOf);
  expect(reads).toBe(0);
  expect(jointAxesOf({ ids: [], instances: source }, positionsOf)).toEqual({ candidates: [], fastened: [], faces: [] });
  expect(reads).toBe(0);
});
