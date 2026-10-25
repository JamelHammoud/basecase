import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { simreadyVisual, type VisualPiece } from '../simreadyVisuals';
import type { BuildContext } from './context';

const hidden = () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

function placedPieces(pieces: VisualPiece[], matrix: number[]): VisualPiece[] {
  const m = new THREE.Matrix4().fromArray(matrix);
  const placed = pieces.map((p) => ({
    geometry: toCreasedNormals(p.geometry.clone().applyMatrix4(m), THREE.MathUtils.degToRad(30)),
    material: p.material,
  }));
  const box = new THREE.Box3();

  for (const p of placed) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }

  const center = box.getCenter(new THREE.Vector3());

  for (const p of placed) {
    p.geometry.translate(-center.x, -center.y, -center.z);
  }

  return placed;
}

export function texturedVisual(ctx: BuildContext): { group: THREE.Group; standIn: THREE.Material } | null {
  const visual = ctx.part.mesh?.visual;
  const pieces = visual && ctx.part.role === 'solid' ? simreadyVisual(ctx.part) : null;

  if (!visual || !pieces?.length) return null;

  const placed = ctx.derive(
    `simready|${visual.key}|${visual.node}|${visual.matrix.join(',')}`,
    () => placedPieces(pieces, visual.matrix),
    (list) => list.forEach((p) => p.geometry.dispose()),
  );
  const group = new THREE.Group();

  for (const p of placed) {
    const material = p.material.clone();

    if (ctx.selected) {
      material.emissive = new THREE.Color('#2563eb');
      material.emissiveIntensity = 0.12;
    }

    const mesh = new THREE.Mesh(p.geometry, material);

    mesh.receiveShadow = true;
    mesh.raycast = () => {};
    group.add(mesh);
  }

  return { group, standIn: hidden() };
}
