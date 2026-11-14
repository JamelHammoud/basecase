import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoseSample } from '../operator/poseFollow';
import { BUILTIN_GESTURES, legs } from './builtinGestures';
import {
  armCircle,
  clap,
  nod,
  openPalm,
  pointLeft,
  pointRight,
  raiseBothHands,
  raiseHand,
  saluteMotion,
  shakeHead,
  SMALL_AND_FAR,
  thumbsUp,
  walkPastScratching,
  wave,
} from './fixtures/gestures';
import { gestureFrame, point } from './gestureFrame';
import { bestMatch, matchThreshold } from './gestureMatch';
import { createGestureRecognizer, exampleFrom, recognize, type TaughtGesture } from './gestureRecognizer';
import { createGestureTap, QUIET_MS, type GestureNews } from './gestureTap';

const names = (samples: PoseSample[], taught: TaughtGesture[] = []) => recognize(samples, taught).map((g) => g.name);

const teach = (name: string, motion: (variant: number) => PoseSample[]): TaughtGesture => ({
  name,
  examples: [0, 1, 2].map((v) => exampleFrom(motion(v))!),
});

const FIXTURES: Record<string, () => PoseSample[]> = {
  wave: () => wave(),
  'raise-hand': () => raiseHand(),
  'raise-both-hands': raiseBothHands,
  'point-left': pointLeft,
  'point-right': pointRight,
  'thumbs-up': thumbsUp,
  'open-palm': openPalm,
  clap: () => clap(1),
  nod,
  'shake-head': shakeHead,
};

describe('gesture frame', () => {
  it('puts the shoulders one width apart on x, whatever the person’s size and facing', () => {
    const adult = gestureFrame(wave()[0].world, 0)!;
    const child = gestureFrame(wave({ person: SMALL_AND_FAR, facingDeg: 20 })[0].world, 0)!;

    for (const frame of [adult, child]) {
      expect(point(frame, 'leftWrist')[0]).toBeGreaterThan(0.4);
      expect(point(frame, 'rightWrist')[0]).toBeLessThan(-0.4);
      expect(point(frame, 'nose')[1]).toBeGreaterThan(0.3);
      expect(point(frame, 'nose')[2]).toBeGreaterThan(0.1);
    }

    expect(point(child, 'leftWrist')[1]).toBeCloseTo(point(adult, 'leftWrist')[1], 1);
  });

  it('counts the legs of a zigzag that clear the amplitude', () => {
    expect(legs([0, 1, 0, 1, 0], 0.5)).toBe(4);
    expect(legs([0, 0.2, 0, 0.2], 0.5)).toBe(0);
  });
});

describe('built-in gestures', () => {
  it.each(BUILTIN_GESTURES)('recognizes %s once from its fixture and nothing else', (name) => {
    expect(names(FIXTURES[name]())).toEqual([name]);
  });

  it('fires one wave for a wave held 3 s, from either hand', () => {
    expect(names(wave({ waveS: 3 }))).toEqual(['wave']);
    expect(names(wave({ side: 'left' }))).toEqual(['wave']);
  });

  it('fires the same wave from a smaller person further away, turned 20°', () => {
    expect(names(wave({ person: SMALL_AND_FAR, facingDeg: 20 }))).toEqual(['wave']);
  });

  it('fires each clap of two', () => {
    expect(names(clap(2))).toEqual(['clap', 'clap']);
  });

  it('fires nothing for someone walking past and scratching their head', () => {
    expect(names(walkPastScratching())).toEqual([]);
  });
});

describe('taught gestures', () => {
  const salute = teach('salute', saluteMotion);
  const circle = teach('arm-circle', armCircle);

  it('trims each example to its movement and keeps it within 3 s at 15 fps', () => {
    for (const example of [...salute.examples, ...circle.examples]) {
      expect(example.length).toBeGreaterThan(10);
      expect(example.length).toBeLessThanOrEqual(45);
    }
  });

  it('sets the threshold from the examples’ own spread, over a floor', () => {
    expect(matchThreshold(salute.examples)).toBeGreaterThanOrEqual(0.12);
    expect(bestMatch(salute.examples[0], salute.examples[1])).toBeLessThan(matchThreshold(salute.examples));
  });

  it('fires a taught salute from a fourth try, and never on a wave or a raised hand', () => {
    expect(names(saluteMotion(3), [salute, circle])).toEqual(['salute']);
    expect(names(wave(), [salute, circle])).toEqual(['wave']);
    expect(names(raiseHand(), [salute, circle])).toEqual(['raise-hand']);
  });

  it('fires a taught arm circle, and nothing on the walk past', () => {
    expect(names(armCircle(3), [salute, circle])).toEqual(['arm-circle']);
    expect(names(walkPastScratching(), [salute, circle])).toEqual([]);
  });

  it('records nothing from a person standing still', () => {
    expect(exampleFrom(saluteMotion(0).slice(0, 10))).toBeNull();
  });
});

describe('recognition cost', () => {
  it('stays under 2 ms a frame with every built-in and two taught gestures', () => {
    const taught = [teach('salute', saluteMotion), teach('arm-circle', armCircle)];
    const samples = [wave({ waveS: 3 }), walkPastScratching(), clap(2)].flatMap((run, i) =>
      run.map((s) => ({ ...s, t: s.t + i * 10000 })),
    );
    const recognizer = createGestureRecognizer(taught);
    const started = performance.now();

    for (const s of samples) recognizer.step(s.world, s.t);

    const perFrame = (performance.now() - started) / samples.length;

    console.info(`gesture recognition: ${perFrame.toFixed(3)} ms a frame over ${samples.length} frames`);
    expect(perFrame).toBeLessThan(2);
  });
});

describe('the worker’s gesture tap', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts each gesture, and an example once the frames span the recording by their own clock', () => {
    const news: GestureNews[] = [];
    const tap = createGestureTap((n) => news.push(n));

    for (const s of wave()) tap.step(s.world, s.t);

    tap.record(1500);

    for (const s of saluteMotion(0)) tap.step(s.world, 10000 + s.t);

    const examples = news.flatMap((n) => (n.type === 'example' ? [n.example] : []));

    expect(news.filter((n) => n.type === 'gesture')).toEqual([{ type: 'gesture', name: 'wave' }]);
    expect(examples).toHaveLength(1);
    expect(examples[0]!.length).toBeGreaterThan(5);
    tap.stop();
  });

  it('posts no example when the frames stop and nothing moved', () => {
    vi.useFakeTimers();

    const news: GestureNews[] = [];
    const tap = createGestureTap((n) => news.push(n));

    tap.record(3000);

    for (const s of saluteMotion(0).slice(0, 8)) tap.step(s.world, s.t);

    vi.advanceTimersByTime(QUIET_MS);
    expect(news).toEqual([{ type: 'example', example: null }]);
  });
});
