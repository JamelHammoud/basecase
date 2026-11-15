import { afterEach, describe, expect, it, vi } from 'vitest';
import { POSE } from '../operator/poseLandmarks';
import { BUILTIN_DETECTORS, legs, smoothed, WINDOW_S } from './builtinGestures';
import { nod, shakeHead, SMALL_AND_FAR, walkPastScratching, wave } from './fixtures/gestures';
import { gestureFrame, point, type GestureFrame } from './gestureFrame';
import { createGestureRecognizer } from './gestureRecognizer';

function measuredHead(frame: GestureFrame) {
  const nose = point(frame, 'nose');
  const left = point(frame, 'leftEar');
  const right = point(frame, 'rightEar');
  const center = left.map((value, i) => (value + right[i]) / 2);
  const forward = nose[2] - center[2];

  return {
    pitch: Math.atan2(center[1] - nose[1], forward) * (180 / Math.PI),
    yaw: Math.atan2(nose[0] - center[0], forward) * (180 / Math.PI),
  };
}

function referenceDetector(window: GestureFrame[], along: 'pitch' | 'yaw') {
  if (window.length <= 1 || window.at(-1)!.t - window[0].t < 0.8 * 0.9) return false;

  const angles = window.map(measuredHead);
  const turn = smoothed(angles.map((head) => head[along]));
  const across = smoothed(angles.map((head) => head[along === 'pitch' ? 'yaw' : 'pitch']));
  const span = Math.max(...across) - Math.min(...across);

  return along === 'pitch' ? legs(turn, 10) >= 2 && span < 12 : legs(turn, 15) >= 3 && span < 12;
}

describe('prepared gesture head angles', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['nod', nod()],
    ['shake', shakeHead()],
    ['wave', wave({ person: SMALL_AND_FAR, facingDeg: 20 })],
    ['walk', walkPastScratching()],
  ] as const)('preserves both head detectors throughout %s', (_, samples) => {
    const window: GestureFrame[] = [];
    const source = structuredClone(samples);

    for (const sample of samples) {
      const frame = gestureFrame(sample.world, sample.t / 1000)!;
      const expected = measuredHead(frame);

      expect(frame.head).toEqual(expected);
      window.push(frame);

      while (window[0].t < frame.t - WINDOW_S) window.shift();

      expect(BUILTIN_DETECTORS.nod(window)).toBe(referenceDetector(window, 'pitch'));
      expect(BUILTIN_DETECTORS['shake-head'](window)).toBe(referenceDetector(window, 'yaw'));
    }

    expect(samples).toEqual(source);
  });

  it('keeps nonfinite head observations and rejected shoulders from producing gestures', () => {
    const samples = nod();
    const recognizer = createGestureRecognizer();

    for (const sample of samples) {
      const world = sample.world.map((mark, i) => (i === POSE.nose ? { ...mark, x: NaN } : mark));
      const frame = gestureFrame(world, sample.t / 1000)!;

      expect(frame.head.pitch).toBeNaN();
      expect(frame.head.yaw).toBeNaN();
      expect(recognizer.step(world, sample.t).fired).toEqual([]);
    }

    const world = samples[0].world.map((mark, i) => (i === POSE.leftShoulder ? { ...mark, visibility: 0 } : mark));
    const angles = vi.spyOn(Math, 'atan2');

    expect(gestureFrame(world, 0)).toBeNull();
    expect(angles).not.toHaveBeenCalled();
  });

  it.each([
    { count: 300, former: 49836 },
    { count: 600, former: 104968 },
  ])('calculates two angles per accepted frame over $count frames', ({ count, former }) => {
    const samples = [...nod(), ...shakeHead()];
    const frames = Array.from({ length: count }, (_, i) =>
      gestureFrame(samples[i % samples.length].world, (i * 1000) / 30 / 1000)!,
    );
    const recognizer = createGestureRecognizer();
    const angles = vi.spyOn(Math, 'atan2');

    for (let i = 0; i < count; i++) recognizer.step(samples[i % samples.length].world, (i * 1000) / 30);

    expect(angles).toHaveBeenCalledTimes(count * 2);
    angles.mockClear();

    const window: GestureFrame[] = [];

    for (const frame of frames) {
      window.push(frame);

      while (window[0].t < frame.t - WINDOW_S) window.shift();

      referenceDetector(window, 'pitch');
      referenceDetector(window, 'yaw');
    }

    expect(angles).toHaveBeenCalledTimes(former);
  });
});
