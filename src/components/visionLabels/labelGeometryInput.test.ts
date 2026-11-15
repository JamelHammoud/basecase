import { describe, expect, it } from 'vitest';
import { labelGeometryInput } from './labelGeometryInput';
import type { ImageAnnotation } from '../../vision/frameSet';

const frame = { width: 8, height: 6 };
const label: ImageAnnotation = {
  instance: 'existing',
  classId: 1,
  box: [0, 0, 1, 1],
  mask: { size: [6, 8], counts: [0, 1, 47] },
  polygons: [[0, 0, 1, 0, 1, 1, 0, 1]],
  keypoints: [{ name: 'center', x: 0, y: 0, visible: true }],
};

describe('label drawing intent', () => {
  it('creates a new polygon even if another label was selected during drawing', () => {
    const input = labelGeometryInput({ polygons: [[1, 1, 4, 1, 4, 4]] }, { frame, classId: 1, label });

    expect(input.instance).not.toBe(label.instance);
    expect(input.keypoints).toBeUndefined();
  });

  it('keeps identity and keypoints when a handle explicitly edits the label', () => {
    const input = labelGeometryInput({ box: [1, 1, 4, 3], replace: true }, { frame, classId: 1, label });

    expect(input.instance).toBe(label.instance);
    expect(input.keypoints).toBe(label.keypoints);
  });
});
