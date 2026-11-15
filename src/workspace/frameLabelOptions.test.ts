import { describe, expect, it } from 'vitest';
import { frameLabelSelection, toggleFrameCamera } from './frameLabelOptions';
import { selectTryFrames } from '../vision/tryFrameSelection';

const source = { stored: { id: 'try', frames: 12, rate: 50 }, recording: null };

describe('frame label options', () => {
  it('extracts the playhead, every nth frame and an inclusive range', () => {
    const options = { frame: 7, from: 2, to: 8, step: 3, count: 4 };
    const selected = (mode: 'frame' | 'every' | 'range' | 'sample') =>
      selectTryFrames([source], frameLabelSelection(mode, options)).map((pick) => pick.frame);

    expect(selected('frame')).toEqual([7]);
    expect(selected('every')).toEqual([0, 3, 6, 9]);
    expect(selected('range')).toEqual([2, 5, 8]);
    expect(selected('sample')).toEqual([0, 4, 7, 11]);
  });

  it('preserves all camera choices while toggling one camera', () => {
    expect(toggleFrameCamera(['front', 'wrist'], 'front')).toEqual(['wrist']);
    expect(toggleFrameCamera(['wrist'], 'front')).toEqual(['wrist', 'front']);
  });
});
