import * as THREE from 'three';
import { worldDeltas } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import type { WorldLooks } from '../sim/worldLooks';
import type { ScenePart } from '../types/robotics';

type Position = [number, number, number];

type WorldPart = Pick<ScenePart, 'id' | 'position' | 'color' | 'visible'>;

export interface WorldFrame {
  model: SimModel | null;
  parts: WorldPart[];
  poses: Float64Array | null;
}

export function worldPositions({ model, parts, poses }: WorldFrame): Record<string, Position> {
  const deltas = model && poses ? worldDeltas(model, poses) : new Map<string, THREE.Matrix4>();

  return Object.fromEntries(
    parts.map((p) => {
      const at = new THREE.Vector3(...p.position).applyMatrix4(deltas.get(p.id) ?? new THREE.Matrix4());

      return [p.id, at.toArray()];
    }),
  );
}

export function worldObjects(frame: WorldFrame, looks: WorldLooks | null) {
  const positions = worldPositions(frame);

  return frame.parts.map((p) => ({
    id: p.id,
    position: positions[p.id],
    color: looks?.[p.id]?.color ?? p.color,
    visible: looks?.[p.id]?.visible ?? p.visible,
  }));
}
