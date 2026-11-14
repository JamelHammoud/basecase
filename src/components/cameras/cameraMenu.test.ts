import { describe, expect, it } from 'vitest';
import type { CameraView } from '../../cameras/views';
import type { ContextMenuEntry } from '../../design-system';
import { arrangeMenu } from '../../design-system/menuOrder';
import { cameraMenu, type CameraMenuActions } from './cameraMenu';

const view = (patch: Partial<CameraView>): CameraView => ({
  key: 'scene',
  label: 'Scene',
  part: null,
  position: [0, 0, 500],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fovDeg: 45,
  lens: { model: 'pinhole', hfovDeg: 60 },
  ...patch,
});

const noop = () => undefined;
const actions: CameraMenuActions = {
  lookThrough: noop,
  startRename: noop,
  reframe: noop,
  setLens: noop,
  remove: noop,
  setPartLens: noop,
};

const entryName = (entry: ContextMenuEntry) => {
  if ('label' in entry) return entry.label;

  return 'heading' in entry ? entry.heading : '—';
};

const labels = (v: CameraView) => arrangeMenu(cameraMenu(v, actions)).map(entryName);

describe('cameraMenu', () => {
  it('offers only Look Through on the framed Scene view, which has no name or lens to change', () => {
    expect(labels(view({}))).toEqual(['Scene', 'Look Through']);
  });

  it('renames and re-lenses a camera part', () => {
    expect(labels(view({ key: 'wrist_cam', label: 'Wrist Cam', part: 'p1' }))).toEqual([
      'Wrist Cam',
      'Look Through',
      'Rename',
      'Lens',
    ]);
  });

  it('adds Use Current View and Delete for a stationary camera', () => {
    expect(labels(view({ key: 'camera_1', label: 'Camera 1', fixed: 'c1' }))).toEqual([
      'Camera 1',
      'Look Through',
      'Rename',
      'Lens',
      'Use Current View',
      '—',
      'Delete',
    ]);
  });
});
