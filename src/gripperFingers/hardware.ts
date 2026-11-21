import { Quaternion, Vector3 } from 'three';
import { specToPart } from '../agent/agentScene';
import type { ScenePart } from '../types/robotics';
import type { FingerDimensions, FingerReference } from './types';
import { fingerFrame, rotationDegrees } from './frames';

export function fingerHardware(
  mount: ScenePart,
  dimensions: FingerDimensions,
  reference: FingerReference,
): ScenePart[] {
  const frame = fingerFrame(mount);
  const rotation = frame.rotation
    .clone()
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2));
  const roles = [
    { role: 'screw' as const, catalog: 'hardware:socket_head|M3|16', x: -4 - dimensions.thickness },
    { role: 'washer' as const, catalog: 'hardware:washer|M3|', x: -10 - dimensions.thickness - 0.25 },
    { role: 'nut' as const, catalog: 'hardware:hex_nut|M3|', x: -1.25 },
  ];

  return [0, 1].flatMap((hole) =>
    roles.map(({ role, catalog, x }) => {
      const part = specToPart({ id: `${mount.id}-finger-${role}-${hole}`, catalog });

      return {
        ...part,
        position: frame.at([x, -dimensions.height / 2 + (hole - 0.5) * dimensions.spacing, 0]),
        rotation: rotationDegrees(rotation),
        gripperFinger: { ...reference, role, hole },
      };
    }),
  );
}
