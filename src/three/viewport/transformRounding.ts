import * as THREE from 'three';
import type { ScenePart } from '../../types/robotics';
import type { PartTransformUpdate, Vec3 } from './types';

const hasFixedSize = (p: ScenePart) => p.kind === 'hardware' || p.kind === 'component' || p.kind === 'mesh';

export function roundingFor(free: boolean) {
  const tenth = (v: number) => Math.round(v * 10) / 10;

  return {
    position: (v: number) => (free ? tenth(v) : Math.round(v * 2) / 2),
    degrees: (rad: number) => (free ? tenth(THREE.MathUtils.radToDeg(rad)) : Math.round(THREE.MathUtils.radToDeg(rad))),
    dimension: (v: number) => Math.max(free ? 0.5 : 2, free ? tenth(v) : Math.round(v)),
  };
}

export interface RestPlacement {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export function roundedUpdate(
  part: ScenePart,
  rest: RestPlacement,
  options: { free: boolean; scale: THREE.Vector3 | null },
): PartTransformUpdate {
  const round = roundingFor(options.free);
  const euler = new THREE.Euler().setFromQuaternion(rest.quaternion, 'XYZ');
  const position = rest.position.toArray().map(round.position) as Vec3;
  const rotation = [euler.x, euler.y, euler.z].map(round.degrees) as Vec3;
  const scale = options.scale;

  if (!scale || hasFixedSize(part)) {
    return { id: part.id, position, rotation };
  }

  return {
    id: part.id,
    position,
    rotation,
    dimensions: {
      ...part.dimensions,
      width: round.dimension(part.dimensions.width * scale.x),
      height: round.dimension(part.dimensions.height * scale.y),
      depth: round.dimension(part.dimensions.depth * scale.z),
    },
  };
}
