import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { samePose } from './samePose';

const at = (x: number, turn = 0) => new THREE.Matrix4().makeRotationY(turn).setPosition(x, 0, 0);

describe('samePose', () => {
  it('treats contact jitter under a hundredth of a millimetre as the same pose', () => {
    expect(samePose(new Map([['wheel', at(10)]]), new Map([['wheel', at(10.004, 2e-6)]]))).toBe(true);
  });

  it('sees a move, a turn, a new part or a cleared pose', () => {
    const shown = new Map([['wheel', at(10)]]);

    expect(samePose(new Map([['wheel', at(10.05)]]), shown)).toBe(false);
    expect(samePose(new Map([['wheel', at(10, 0.001)]]), shown)).toBe(false);
    expect(samePose(new Map([['chassis', at(10)]]), shown)).toBe(false);
    expect(samePose(new Map(), shown)).toBe(false);
    expect(samePose(new Map(), new Map())).toBe(true);
  });
});
