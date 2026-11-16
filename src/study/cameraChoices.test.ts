import { describe, expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { studyScene, studyFingerprint, enumerateStudy } from './study';
import { validateStudyKnobs } from './knobs';
import type { StudyKnob, StudyScene } from './types';

const camera = {
  ...box('eye', [0, 100, 0], [20, 20, 20], 0),
  kind: 'component' as const,
  componentId: 'raspberry-pi-camera-3',
};
const scene: StudyScene = { parts: [camera], project: DEFAULT_PROJECT, triangles: {}, measures: {} };
const pose: StudyKnob = {
  id: 'eye-pose',
  kind: 'camera_pose',
  part: 'eye',
  values: [{ position: [10, 100, 0], rotation: [0, 90, 0] }],
};
const lens: StudyKnob = {
  id: 'eye-lens',
  kind: 'camera_lens',
  part: 'eye',
  values: [
    { model: 'pinhole', hfovDeg: 60 },
    { model: 'fisheye', fovDeg: 180 },
  ],
};

describe('Study camera choices', () => {
  it('composes pose and lens immutably and fingerprints each optical choice', async () => {
    const edited = await studyScene(scene, [pose, lens], [0, 1]);

    expect(edited.parts[0]).toMatchObject({
      position: [10, 100, 0],
      rotation: [0, 90, 0],
      cameraLens: { model: 'fisheye', fovDeg: 180 },
    });
    expect(scene.parts[0]).toBe(camera);
    expect(edited.project).toBe(scene.project);
    expect(studyFingerprint(edited.parts, edited.project)).not.toBe(studyFingerprint(scene.parts, scene.project));

    const other = await studyScene(scene, [lens], [0]);

    expect(studyFingerprint(other.parts, other.project)).not.toBe(studyFingerprint(scene.parts, scene.project));
    expect(enumerateStudy([pose, lens])).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('moves rigid mates together and leaves other parts alone', async () => {
    const mounted = {
      ...camera,
      mates: [{ port: 'back', target: 'mount', targetPort: 'face', type: 'fastened' as const }],
    };
    const mount = box('mount', [0, 100, 10], [20, 20, 5], 0);
    const unrelated = box('unrelated', [0, 0, 0], [10, 10, 10], 0);
    const edited = await studyScene({ ...scene, parts: [mounted, mount, unrelated] }, [pose], [0]);

    expect(edited.parts[1].position).toEqual([expect.closeTo(20, 10), expect.closeTo(100, 10), expect.closeTo(0, 10)]);
    expect(edited.parts[0].mates).toEqual(mounted.mates);
    expect(edited.parts[2]).toBe(unrelated);
  });

  it.each([
    { ...lens, values: [{ model: 'pinhole', hfovDeg: 121 }] },
    { ...lens, values: [{ model: 'fisheye', fovDeg: 119 }] },
    { ...pose, values: [{ position: [Infinity, 0, 0], rotation: [0, 0, 0] }] },
    { ...pose, values: [{ position: [0, 0, 0], rotation: [0, 0] }] },
  ])('refuses malformed or unsupported optics and poses', (knob) => {
    expect(validateStudyKnobs([knob])).toBe(false);
  });

  it('refuses choices targeting an unknown part or a non-camera', async () => {
    await expect(studyScene({ ...scene, parts: [] }, [pose], [0])).rejects.toThrow();
    await expect(
      studyScene({ ...scene, parts: [box('eye', [0, 0, 0], [10, 10, 10], 0)] }, [lens], [0]),
    ).rejects.toThrow();
  });
});
