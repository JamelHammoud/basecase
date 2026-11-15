import { describe, expect, it } from 'vitest';
import { dueIds, nextDue } from './streamPace';
import { visionCameraPaces } from './visionPace';

describe('camera inference pacing', () => {
  it('schedules fresh frames for a stationary hidden camera while a Routine watches it', () => {
    const paces = visionCameraPaces(
      [{ camera: 'wrist', modelId: 'objects', fps: 5, continuous: true }],
      new Set(['wrist']),
      100,
    );

    expect(dueIds([...paces], 100)).toEqual(['wrist']);
    expect(nextDue([...paces.values()])).toBe(100);
  });

  it('leaves ordinary static camera tiles idle and ignores cameras from other feeds', () => {
    const paces = visionCameraPaces(
      [
        { camera: 'scene', modelId: 'objects', fps: 5, continuous: false },
        { camera: 'operator', modelId: 'objects', fps: 10, continuous: true },
      ],
      new Set(['scene']),
      0,
    );

    expect(nextDue([...paces.values()])).toBe(Infinity);
  });
});
