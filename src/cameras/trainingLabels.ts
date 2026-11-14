import * as THREE from 'three';
import type { V3 } from '../utils/kinematics';
import { lensPoint } from './lens';
import type { LensShot } from './lensRender';
import type { TrainingKeypoint, TrainingPoint } from './trainingTypes';

export const trainingInstances = (items: Array<{ id: string }>) =>
  items
    .map((item) => item.id)
    .sort()
    .map((instance, index) => ({ id: index + 1, instance }));

interface PackedTrainingPixels {
  width: number;
  height: number;
  ids: Uint8Array;
  distances: Uint8Array;
}

const integerAt = (bytes: Uint8Array, offset: number) =>
  bytes[offset] * 65536 + bytes[offset + 1] * 256 + bytes[offset + 2];

export function decodeTrainingPixels({ width, height, ids, distances }: PackedTrainingPixels) {
  const instanceIds = new Uint32Array(width * height);
  const depth = new Float32Array(width * height);
  const packedDepth = new DataView(distances.buffer, distances.byteOffset, distances.byteLength);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const source = ((height - 1 - y) * width + x) * 4;
      const id = integerAt(ids, source);

      instanceIds[pixel] = id;
      depth[pixel] = packedDepth.getFloat32(source, false);
    }
  }

  return { instanceIds, depth };
}

interface Projection {
  shot: LensShot;
  width: number;
  height: number;
  depth: Float32Array;
  points: TrainingPoint[];
  deltas?: Map<string, THREE.Matrix4>;
}

function projectedPoint(point: TrainingPoint, job: Projection, inverse: THREE.Matrix4): TrainingKeypoint {
  const world = new THREE.Vector3(...point.position);
  const delta = job.deltas?.get(point.instance);

  if (delta) world.applyMatrix4(delta);

  const local = world.clone().applyMatrix4(inverse);
  const image = lensPoint(job.shot.lens, local.toArray() as V3, job.width / job.height);

  if (!image) return { instance: point.instance, name: point.name, x: 0, y: 0, visible: false };

  const x = ((image[0] + 1) / 2) * job.width;
  const y = ((1 - image[1]) / 2) * job.height;
  const inFrame = x >= 0 && y >= 0 && x < job.width && y < job.height;
  const measured = job.depth[Math.floor(y) * job.width + Math.floor(x)] ?? 0;
  const distance = world.distanceTo(new THREE.Vector3(...job.shot.position));
  const visible = inFrame && measured > 0 && distance <= measured + Math.max(1, measured * 0.002);

  return { instance: point.instance, name: point.name, x, y, visible };
}

export function projectTrainingPoints(job: Projection): TrainingKeypoint[] {
  const camera = new THREE.PerspectiveCamera();

  camera.position.set(...job.shot.position);
  camera.up.set(...job.shot.up);
  camera.lookAt(...job.shot.target);
  camera.updateMatrixWorld(true);

  return job.points.map((point) => projectedPoint(point, job, camera.matrixWorldInverse));
}
