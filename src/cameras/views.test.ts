import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { pickViews } from './cameraShots';
import type { FixedCamera } from './fixed';
import { cameraViews, findView, hasCameraViews } from './views';

const wrist = {
  id: 'cam',
  name: 'Wrist Camera',
  kind: 'component',
  category: 'primitives',
  role: 'solid',
  componentId: 'raspberry-pi-camera-3',
  position: [100, 200, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 25, height: 12, depth: 24 },
  color: '#fff',
  note: '',
  visible: true,
  locked: false,
} as ScenePart;

const outside: FixedCamera = {
  id: 'f1',
  name: 'Outside',
  position: [0, 600, 1200],
  target: [0, 100, 0],
  lens: { model: 'fisheye', fovDeg: 180 },
};

describe('camera views', () => {
  it('has views only with a camera part, a stationary camera or a simulation', () => {
    const box = { ...wrist, id: 'box', componentId: undefined, kind: 'box' } as ScenePart;

    expect(hasCameraViews([box], [], false)).toBe(false);
    expect(hasCameraViews([{ ...wrist, visible: false }], [], false)).toBe(false);
    expect(hasCameraViews([wrist], [], false)).toBe(true);
    expect(hasCameraViews([box], [outside], false)).toBe(true);
    expect(hasCameraViews([box], [], true)).toBe(true);
  });

  it('frames a scene view when nothing stationary is placed', () => {
    expect(cameraViews([wrist], []).map((v) => v.key)).toEqual(['scene', 'wrist_camera']);
  });

  it('puts stationary cameras first, with their own lens', () => {
    const views = cameraViews([wrist], [], [outside]);

    expect(views.map((v) => v.key)).toEqual(['outside', 'wrist_camera']);
    expect(views[0].fixed).toBe('f1');
    expect(views[0].lens).toEqual(outside.lens);
  });

  it('follows a part’s own lens over the catalog', () => {
    const [, view] = cameraViews([{ ...wrist, cameraLens: { model: 'fisheye', fovDeg: 200 } }], []);

    expect(view.lens).toEqual({ model: 'fisheye', fovDeg: 200 });
  });

  it('finds cameras by label or key and lists the ones it can’t', () => {
    const views = cameraViews([wrist], [], [outside]);

    expect(findView(views, 'wrist camera')?.part).toBe('cam');
    expect(pickViews(views, ['Outside', 'wrist_camera', 'Head'])).toMatchObject({ missing: ['Head'] });
  });
});
