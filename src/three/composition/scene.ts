import * as THREE from 'three';
import type { ScenePart } from '../../types/robotics';
import { buildPartGroup, releasePartGroup } from '../buildPartMesh';
import { framing } from '../viewport/cameraOps';
import type { ViewShot } from '../viewport/types';
import type { CompositionSettings } from './settings';

export interface CompositionSnapshot {
  parts: ScenePart[];
  pose: Record<string, number[]>;
}

export const compositionParts = (parts: ScenePart[]) =>
  parts.filter((part) => part.visible && part.role === 'solid' && part.kind !== 'image_plane');

export function compositionRoot(snapshot: CompositionSnapshot): THREE.Group {
  const root = new THREE.Group();

  try {
    for (const part of compositionParts(snapshot.parts)) {
      const group = buildPartGroup(part, false, { shareGeometry: true, lateEdges: true });

      root.add(group);
      group.updateMatrix();

      const delta = snapshot.pose[part.id];

      if (delta) {
        group.matrix.premultiply(new THREE.Matrix4().fromArray(delta));
        group.matrixAutoUpdate = false;
      }

      group.traverse((object) => {
        if (object instanceof THREE.Line || object instanceof THREE.Sprite) object.visible = false;
      });

      if (group.userData.placeholder) throw new Error('Load every scene mesh before rendering.');
    }

    root.updateMatrixWorld(true);

    return root;
  } catch (error) {
    releaseComposition(root);

    throw error;
  }
}

export const releaseComposition = (root: THREE.Group) => root.children.forEach(releasePartGroup);

export function compositionCamera(settings: CompositionSettings): THREE.PerspectiveCamera {
  const { view, width, height } = settings;
  const aspect = width / height;
  const vertical = THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(view.hfovDeg / 2)) / aspect),
  );
  const distance = new THREE.Vector3(...view.position).distanceTo(new THREE.Vector3(...view.target));
  const camera = new THREE.PerspectiveCamera(
    vertical,
    aspect,
    Math.max(0.001, distance / 10000),
    Math.max(1000, distance * 1000),
  );

  camera.position.set(...view.position);
  camera.lookAt(new THREE.Vector3(...view.target));
  camera.updateMatrixWorld(true);

  return camera;
}

export function frameComposition(root: THREE.Group, settings: CompositionSettings): ViewShot {
  const camera = compositionCamera(settings);
  const box = new THREE.Box3().setFromObject(root);

  if (box.isEmpty()) return settings.view;

  const direction = camera.position
    .clone()
    .sub(new THREE.Vector3(...settings.view.target))
    .normalize();
  const framed = framing(camera, box, direction, Infinity);

  return { position: framed.position.toArray(), target: framed.target.toArray(), hfovDeg: settings.view.hfovDeg };
}
