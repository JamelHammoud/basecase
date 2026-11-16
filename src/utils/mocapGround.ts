import { Vector3 } from 'three';
import { forwardKinematics, type Rig, type V3 } from './kinematics';
import type { RetargetStep } from './retargeter';

export function groundFeet(rig: Rig, soles: Array<{ part: string; p: V3 }>, frames: RetargetStep[], near: number) {
  const carriers = soles.map(({ part, p }) => ({ owner: rig.ownerOf.get(part), p }));
  const point = new Vector3();
  let ground = Infinity;

  for (const frame of frames) ground = Math.min(ground, frame.lowestAnkle);

  for (const { keyframe, lowestAnkle } of frames) {
    const posed = forwardKinematics(rig, keyframe);
    let low = Infinity;

    for (const { owner, p } of carriers) {
      point.set(p[0], p[1], p[2]).applyMatrix4(posed.joint.get(owner!) ?? posed.root);
      low = Math.min(low, point.y);
    }

    if (low < 0 || lowestAnkle - ground < near)
      keyframe.root.position[1] = Math.round((keyframe.root.position[1] - low) * 10) / 10;
  }
}
