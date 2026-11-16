import { Euler, Matrix4, Vector3 } from 'three';
import { toScene, toCad, eulerToMatrix } from '../agent/agentFrame';
import type { V3 } from '../utils/kinematics';
import type { StudyKnob } from './types';

const basis = new Matrix4().makeBasis(
  new Vector3(...toScene([1, 0, 0])),
  new Vector3(...toScene([0, 1, 0])),
  new Vector3(...toScene([0, 0, 1])),
);
const inverse = basis.clone().invert();
const preciseDegrees = (radians: number) => Math.round(((radians * 180) / Math.PI) * 1e10) / 1e10 || 0;

export function cameraMatrixRotation(matrix: Matrix4): V3 {
  const euler = new Euler().setFromRotationMatrix(matrix);

  return [preciseDegrees(euler.x), preciseDegrees(euler.y), preciseDegrees(euler.z)];
}

export function cameraKnobFrame(knob: StudyKnob, frame: 'scene' | 'agent'): StudyKnob {
  if (knob.kind !== 'camera_pose') return knob;

  const position = frame === 'scene' ? toScene : toCad;
  const left = frame === 'scene' ? basis : inverse;
  const right = frame === 'scene' ? inverse : basis;

  return {
    ...knob,
    values: knob.values.map((pose) => ({
      position: position(pose.position),
      rotation: cameraMatrixRotation(left.clone().multiply(eulerToMatrix(pose.rotation)).multiply(right)),
    })),
  };
}
