import { describe, expect, it } from 'vitest';
import { videoTime } from './videoTime';

const video = { camera: 'front', path: 'front.mp4', from: 5, to: 9 };

describe('recorded video alignment', () => {
  it('seeks a chunked imported video at its stored file offset', () => {
    expect(videoTime(video, 'import', 0)).toBe(5);
    expect(videoTime(video, 'import', 2.5)).toBe(7.5);
    expect(videoTime(video, 'import', 4)).toBeNull();
  });

  it('places an operator clip at its timeline offset and blanks outside its span', () => {
    expect(videoTime(video, 'operate', 0)).toBeNull();
    expect(videoTime(video, 'operate', 5)).toBe(0);
    expect(videoTime(video, 'operate', 7.5)).toBe(2.5);
    expect(videoTime(video, 'operate', 9)).toBeNull();
    expect(videoTime(video, 'operate', NaN)).toBeNull();
  });
});
