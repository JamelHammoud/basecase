import * as THREE from 'three';
import type { RobotJoint } from '../types/robotics';
import { posedAxis, type PosedRig } from './kinematicsMotion';
import type { Rig } from './kinematicsRig';

const DEG = Math.PI / 180;

export function prepareIkJacobian(rig: Rig, vars: RobotJoint[], owners: Array<string | null>) {
  const rows = owners.map((owner) => {
    const chain = owner ? rig.chain.get(owner) : undefined;

    return vars.map((joint) => ({ column: new THREE.Vector3(), active: chain?.has(joint.id) ?? false }));
  });
  const columns = rows.map((row) => row.map((entry) => entry.column));

  return (posed: PosedRig, points: ReadonlyArray<{ p: THREE.Vector3 }>): THREE.Vector3[][] => {
    const axes = vars.map((joint) => posedAxis(rig, posed, joint));

    rows.forEach((row, i) => {
      row.forEach((entry, a) => {
        if (!entry.active) return;

        const { axis, origin } = axes[a];

        if (vars[a].type === 'prismatic') {
          entry.column.copy(axis);

          return;
        }

        entry.column.subVectors(points[i].p, origin).crossVectors(axis, entry.column).multiplyScalar(DEG);
      });
    });

    return columns;
  };
}
