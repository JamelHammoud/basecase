import { Box3, Euler, Quaternion, Vector3 } from 'three';
import type { ScenePart } from '../types/robotics';
import type { V3 } from '../utils/kinematics';
import { readFinger } from './dimensions';
import { fingerFrame } from './frames';

function contactPart(part: ScenePart): ScenePart {
  const d = part.gripperFinger?.role === 'finger' && readFinger(part);

  if (!d) return part;

  return {
    ...part,
    position: fingerFrame(part).at([-d.clearance - d.thickness / 2, d.thickness + d.length / 2, 0]),
    dimensions: { width: d.thickness, height: d.length, depth: d.depth },
  };
}

export function jawContactPart(owned: ScenePart[]): ScenePart | null {
  const fingers = owned.filter((part) => part.gripperFinger?.role === 'finger');
  const parts = (fingers.length ? fingers : owned.filter((part) => !part.hardware)).map(contactPart);
  const first = parts[0];

  if (!first) return null;

  if (parts.length === 1) return first;

  const rotation = new Quaternion().setFromEuler(new Euler(...first.rotation.map((value) => (value * Math.PI) / 180)));
  const inverse = rotation.clone().invert();
  const bounds = new Box3();

  for (const part of parts) {
    const partRotation = new Quaternion().setFromEuler(
      new Euler(...part.rotation.map((value) => (value * Math.PI) / 180)),
    );

    for (let corner = 0; corner < 8; corner++) {
      const d = part.dimensions;
      const point = new Vector3(
        ((corner & 1 ? 1 : -1) * d.width) / 2,
        ((corner & 2 ? 1 : -1) * d.height) / 2,
        ((corner & 4 ? 1 : -1) * d.depth) / 2,
      );

      bounds.expandByPoint(
        point
          .applyQuaternion(partRotation)
          .add(new Vector3(...part.position))
          .applyQuaternion(inverse),
      );
    }
  }

  const center = bounds.getCenter(new Vector3()).applyQuaternion(rotation);
  const size = bounds.getSize(new Vector3());

  return { ...first, position: center.toArray() as V3, dimensions: { width: size.x, height: size.y, depth: size.z } };
}
