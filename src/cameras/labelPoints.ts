import * as THREE from 'three';
import type { VisionKeypoint } from '../vision/frameSet';
import { lensPoint } from './lens';
import type { LensShot } from './lensRender';
import type { LabelInstance } from './labelPixels';

interface Projection {
  shot: LensShot;
  width: number;
  height: number;
  depth: Float32Array;
  instances: LabelInstance[];
}

function projected(point: THREE.Vector3, input: Projection): VisionKeypoint {
  const image = lensPoint(input.shot.lens, [point.x, point.y, point.z], input.width / input.height);

  if (!image) return { x: 0, y: 0, visibility: 0 };

  const x = ((image[0] + 1) * input.width) / 2;
  const y = ((1 - image[1]) * input.height) / 2;

  if (x < 0 || x >= input.width || y < 0 || y >= input.height) return { x: 0, y: 0, visibility: 0 };

  const surface = input.depth[Math.floor(y) * input.width + Math.floor(x)];

  return { x, y, visibility: surface > 0 && point.length() <= surface + 5 ? 2 : 1 };
}

export function projectedKeypoints(input: Projection): Record<number, Record<string, VisionKeypoint>> {
  const camera = new THREE.PerspectiveCamera();

  camera.position.set(...input.shot.position);
  camera.up.set(...input.shot.up);
  camera.lookAt(...input.shot.target);
  camera.updateMatrixWorld();

  return Object.fromEntries(
    input.instances.map((instance) => [
      instance.id,
      Object.fromEntries(
        Object.entries(instance.keypoints).map(([name, point]) => [
          name,
          projected(new THREE.Vector3(...point).applyMatrix4(camera.matrixWorldInverse), input),
        ]),
      ),
    ]),
  );
}
