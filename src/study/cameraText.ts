import { horizontalDeg } from '../cameras/lens';
import type { V3 } from '../utils/kinematics';
import { validCameraLens, validCameraPose } from './cameraChoices';
import type { StudyKnob } from './types';

type CameraKnob = Extract<StudyKnob, { kind: 'camera_pose' | 'camera_lens' }>;

export function cameraKnobText(knob: CameraKnob): string {
  if (knob.kind === 'camera_pose')
    return knob.values.map(({ position, rotation }) => [...position, ...rotation].join(' ')).join(', ');

  return knob.values.map((lens) => `${lens.model} ${horizontalDeg(lens)}`).join(', ');
}

export function editCameraKnob(knob: CameraKnob, pieces: string[]): CameraKnob | null {
  if (pieces.length > 64) return null;

  if (knob.kind === 'camera_pose') {
    const values = pieces
      .map((piece) => piece.split(/\s+/).map(Number))
      .map((v) => ({
        position: v.slice(0, 3) as V3,
        rotation: v.slice(3) as V3,
      }));

    return values.every(validCameraPose) ? { ...knob, values } : null;
  }

  const values = pieces.map((piece) => {
    const [model, angle, extra] = piece.split(/\s+/);

    if (extra || (model !== 'pinhole' && model !== 'fisheye')) return null;

    return model === 'pinhole' ? { model, hfovDeg: Number(angle) } : { model, fovDeg: Number(angle) };
  });

  return values.every(validCameraLens) ? { ...knob, values } : null;
}
