import * as THREE from 'three';
import { measureTriangles, type MeshMeasure } from '../three/meshMeasure';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { buildRig, partMatrix, type Rig } from '../utils/kinematics';

export interface SimGuests {
  parts: ScenePart[];
  joints: RobotJoint[];
}

export const NO_GUESTS: SimGuests = { parts: [], joints: [] };

interface SceneInput {
  parts: ScenePart[];
  rig: Rig;
  measures: Record<string, MeshMeasure | undefined>;
  partTriangles: (id: string) => Float32Array | null;
}

function boxMeasure(p: ScenePart): MeshMeasure {
  const { width, height, depth } = p.dimensions;
  const half = [width / 2, height / 2, depth / 2];

  return {
    volumeMm3: width * height * depth,
    areaMm2: 2 * (width * height + height * depth + depth * width),
    min: p.position.map((x, i) => x - half[i]) as MeshMeasure['min'],
    max: p.position.map((x, i) => x + half[i]) as MeshMeasure['max'],
    centroid: [...p.position],
    triangles: 12,
  };
}

function placedMeasure(p: ScenePart, local: Float32Array | null): MeshMeasure {
  if (!local || local.length < 9) return boxMeasure(p);

  const place = partMatrix(p);
  const placed = new Float32Array(local.length);
  const v = new THREE.Vector3();

  for (let i = 0; i < local.length; i += 3) {
    v.set(local[i], local[i + 1], local[i + 2]).applyMatrix4(place);
    placed.set([v.x, v.y, v.z], i);
  }

  return measureTriangles(placed);
}

export function withGuests<T extends SceneInput>(input: T, guests: SimGuests): T {
  if (!guests.joints.length) return input;

  const parts = [...input.parts, ...guests.parts];
  const measures = { ...input.measures };

  for (const p of guests.parts) measures[p.id] = placedMeasure(p, input.partTriangles(p.id));

  return { ...input, parts, measures, rig: buildRig([...input.rig.joints, ...guests.joints], parts) };
}
