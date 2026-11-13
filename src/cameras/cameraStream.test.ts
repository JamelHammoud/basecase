import { describe, expect, it, vi } from 'vitest';
import { cameraStream } from './cameraStream';
import type { FeedStream } from './liveFeed';
import type { CameraView } from './views';

const views = [
  { key: 'scene', label: 'Scene' },
  { key: 'gripper_cam', label: 'Gripper Cam' },
] as CameraView[];

function sources(operatorOpen = false) {
  const asked: FeedStream[] = [];
  const stop = vi.fn();
  const operator = vi.fn(() => 'operator needs the camera input running');

  return {
    asked,
    stop,
    operator,
    stream: cameraStream({
      views,
      feed: (stream) => {
        asked.push(stream);

        return stop;
      },
      operator,
      operatorOpen: () => operatorOpen,
    }),
  };
}

const ask = { width: 320, height: 240, fps: 10 };

describe('cameraStream', () => {
  it('streams a view found by key or label', () => {
    const { stream, asked, stop } = sources();
    const onFrame = () => undefined;

    expect(stream('Gripper Cam', ask, onFrame)).toBe(stop);
    expect(asked).toEqual([{ key: 'gripper_cam', size: [320, 240], fps: 10, onFrame }]);
  });

  it('refuses an unknown camera with the cameras there', () => {
    expect(sources().stream('wrist', ask, () => undefined)).toBe(
      'wrist isn’t a camera here. Cameras: scene, gripper_cam',
    );
    expect(sources(true).stream('wrist', ask, () => undefined)).toBe(
      'wrist isn’t a camera here. Cameras: scene, gripper_cam, operator',
    );
  });

  it('hands operator to the computer’s camera', () => {
    const { stream, operator, asked } = sources();

    expect(stream('operator', ask, () => undefined)).toBe('operator needs the camera input running');
    expect(operator).toHaveBeenCalledOnce();
    expect(asked).toEqual([]);
  });
});
