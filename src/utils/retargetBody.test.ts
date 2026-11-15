import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { calibrator, type Human } from './retargetBody';

function frame(offset = 0): Human {
  return new Map([
    ['leftHip', new THREE.Vector3(-1, offset, 0)],
    ['rightHip', new THREE.Vector3(1, offset, 0)],
    ['hips', new THREE.Vector3(0, offset, 0)],
  ]);
}

const coordinates = (h: Human) => [...h].map(([k, p]) => [k, p.toArray()]);

describe('live rest-pose calibration', () => {
  it('returns the steady window mean with owned vectors and unchanged source frames', () => {
    const samples = [frame(-1 / 128), frame(1 / 64), frame(1 / 256)];
    const before = samples.map(coordinates);
    const calibrate = calibrator(3);

    expect(calibrate(samples[0])).toBeNull();
    expect(calibrate(samples[1])).toBeNull();

    const rest = calibrate(samples[2])!;

    expect(coordinates(rest)).toEqual(coordinates(frame(1 / 256)));
    expect(samples.map(coordinates)).toEqual(before);

    rest.get('hips')!.set(100, 100, 100);

    expect(samples.map(coordinates)).toEqual(before);
  });

  it('waits until motion leaves the window and accepts the current mean', () => {
    const calibrate = calibrator(3);
    const results = [0.5, 0, 0, 0.003].map((offset) => calibrate(frame(offset)));

    expect(results.slice(0, 3)).toEqual([null, null, null]);
    expect(coordinates(results[3]!)).toEqual(coordinates(frame(0.001)));
  });

  it('requires matching keys even when frame sizes match, regardless of insertion order', () => {
    const calibrate = calibrator(2);
    const changed = frame();

    changed.delete('hips');
    changed.set('chest', new THREE.Vector3());

    expect(calibrate(frame())).toBeNull();
    expect(calibrate(changed)).toBeNull();
    expect(calibrate(frame())).toBeNull();
    expect(coordinates(calibrate(new Map([...frame()].reverse()))!)).toEqual(coordinates(frame()));
  });

  it('accepts shoulders without hips and refuses frames without either side pair', () => {
    const shoulders: Human = new Map([
      ['leftShoulder', new THREE.Vector3(-1, 1, 0)],
      ['rightShoulder', new THREE.Vector3(1, 1, 0)],
    ]);
    const calibrate = calibrator(1);

    expect(coordinates(calibrate(shoulders)!)).toEqual(coordinates(shoulders));
    expect(calibrate(new Map([['hips', new THREE.Vector3()]]))).toBeNull();
    expect(calibrate(new Map())).toBeNull();
  });

  it('keeps the three-percent body-span threshold and rejects non-finite positions', () => {
    const accepted = calibrator(2);
    const rejected = calibrator(2);
    const nonFinite = frame();

    expect(accepted(frame(-0.059))).toBeNull();
    expect(accepted(frame(0.059))).not.toBeNull();
    expect(rejected(frame(-0.061))).toBeNull();
    expect(rejected(frame(0.061))).toBeNull();

    nonFinite.get('hips')!.x = Number.NaN;

    expect(calibrator(1)(nonFinite)).toBeNull();
  });
});
