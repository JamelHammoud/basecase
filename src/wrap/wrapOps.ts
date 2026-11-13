import * as THREE from 'three';
import type { GeometryPayload, Instance, ShapeSpec } from '../three/analysis/analysisOps';
import { mergeMeshes } from '../three/analysis/shapeSolid';
import { reply } from '../utils/workerRpc';
import { loadManifold } from './manifold';
import { wrapRobot } from './wrapCore';
import type { WrapJoint } from './wrapTypes';

export interface WrapPayload {
  geometries: GeometryPayload[];
  shapes: ShapeSpec[];
  instances: Instance[];
  mesh: string;
  bodies: Array<{ id: string; link: string }>;
  joints: WrapJoint[];
  floorY: number | null;
}

function worldSoups(payload: WrapPayload): Map<string, Float32Array> {
  const geometries = new Map(payload.geometries.map((g) => [g.id, g]));
  const shapes = new Map(payload.shapes.map((s) => [s.key, s]));
  const frame = new THREE.Matrix4();
  const local = new THREE.Matrix4();

  return new Map(
    payload.instances.map((instance) => {
      frame.fromArray(instance.matrix);

      const meshes = (shapes.get(instance.key)?.meshes ?? []).map((m) => ({
        ...geometries.get(m.geometry)!,
        matrix: frame.clone().multiply(local.fromArray(m.matrix)).toArray(),
      }));

      return [instance.id, mergeMeshes(meshes)];
    }),
  );
}

export const wrapHandlers = {
  wrap: async (payload: WrapPayload) => {
    const soups = worldSoups(payload);
    const mesh = soups.get(payload.mesh);

    if (!mesh) throw new Error('The mesh has no triangles.');

    const bodies = payload.bodies.flatMap((b) => {
      const soup = soups.get(b.id);

      return soup ? [{ ...b, soup }] : [];
    });
    const result = wrapRobot(await loadManifold(), { mesh, bodies, joints: payload.joints, floorY: payload.floorY });

    return reply(
      result,
      result.shells.flatMap((s) => [s.positions.buffer, s.indices.buffer]),
    );
  },
};
