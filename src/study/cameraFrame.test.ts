import { expect, it } from 'vitest';
import { cameraKnobFrame } from './cameraFrame';
import type { StudyKnob } from './types';

it('preserves fine camera rotation choices while converting between agent and scene frames', () => {
  const knob: StudyKnob = {
    id: 'pose',
    kind: 'camera_pose',
    part: 'eye',
    values: [{ position: [1, 2, 3], rotation: [0, 0, 0.025] }],
  };
  const scene = cameraKnobFrame(knob, 'scene');

  expect(scene).toMatchObject({ values: [{ position: [1, 3, -2], rotation: [0, 0.025, 0] }] });
  expect(cameraKnobFrame(scene, 'agent')).toEqual(knob);
});
