import * as THREE from 'three';
import { assemblyGeometry } from '../assembly/assemblyGeometry';
import { fastenerInput } from '../assembly/fastenerSpec';
import { place } from '../three/analysis/collide';
import { ShapeSolid } from '../three/analysis/shapeSolid';
import type { Box } from '../guide/guideTypes';
import type { FrozenKit } from './frozenKit';

export function retainedRepairGeometry(kit: FrozenKit, serviceable: string[]) {
  const solids: ShapeSolid[] = [];

  try {
    const placed = kit.parts
      .filter((part) => part.role === 'solid')
      .map((part) => {
        const mesh = kit.geometry[part.id];
        const positions = new Float32Array(mesh.indices.length * 3);

        mesh.indices.forEach((index, corner) => {
          positions[corner * 3] = mesh.positions[index * 3];
          positions[corner * 3 + 1] = mesh.positions[index * 3 + 1];
          positions[corner * 3 + 2] = mesh.positions[index * 3 + 2];
        });

        const solid = new ShapeSolid(positions);
        const rotation = new THREE.Euler(...part.rotation.map(THREE.MathUtils.degToRad));
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(...part.position),
          new THREE.Quaternion().setFromEuler(rotation),
          new THREE.Vector3(1, 1, 1),
        );

        solids.push(solid);

        return place(part.id, solid, matrix);
      });
    const boxes = Object.fromEntries(
      placed.map(({ id, box }): [string, Box] => [id, { min: box.min.toArray(), max: box.max.toArray() }]),
    );
    const targets = placed.filter((part) => serviceable.includes(part.id));
    const neighborhood = targets.map((part) => part.box.clone().expandByScalar(160));
    const groups = new Set(
      kit.parts.filter((part) => serviceable.includes(part.id)).flatMap((part) => (part.group ? [part.group.id] : [])),
    );
    const grouped = new Set(kit.parts.filter((part) => part.group && groups.has(part.group.id)).map((part) => part.id));
    const movable = placed
      .filter((part) => grouped.has(part.id) || neighborhood.some((box) => box.intersectsBox(part.box)))
      .map((part) => part.id);
    const geometry = assemblyGeometry(placed, { ...fastenerInput(kit.parts), serviceable, movable, budgetMs: 20000 });

    return { geometry, boxes };
  } finally {
    solids.forEach((solid) => solid.dispose());
  }
}
