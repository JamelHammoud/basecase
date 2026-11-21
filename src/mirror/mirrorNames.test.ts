import { describe, expect, it, vi } from 'vitest';
import { mirroredName, SIDE_WORDS, swapWords } from './mirrorNames';

const previousPairs = {
  x: [['left', 'right']],
  y: [
    ['front', 'rear'],
    ['front', 'back'],
  ],
  z: [['top', 'bottom']],
};

function previousSwap(name: string, axis: keyof typeof previousPairs) {
  return previousPairs[axis].reduce((text, [a, b]) => {
    const pattern = new RegExp(`(?<![A-Za-z])(${a}|${b})(?![a-z])`, 'gi');

    return text.replace(pattern, (match) => {
      const replacement = match.toLowerCase() === a ? b : a;

      if (match === match.toUpperCase()) return replacement.toUpperCase();

      return match[0] === match[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
    });
  }, name);
}

describe('Mirror side naming', () => {
  it('preserves case, word boundaries, ordered front rules and fallback names across repeated calls', () => {
    const names = [
      '',
      'Left hip',
      'RIGHT_KNEE',
      'left-right left',
      'Bright upright leftover',
      'left2 right3',
      'LeftRight',
      'front rear back',
      'FRONT_Rear_Back',
      'top.bottom Top BOTTOM',
      'éleft righté',
      'Torso (Mirror)',
    ];

    for (let repeat = 0; repeat < 3; repeat++) {
      for (const axis of ['x', 'y', 'z'] as const) {
        for (const name of names) {
          const expected = previousSwap(name, axis);

          expect(swapWords(name, SIDE_WORDS[axis])).toBe(expected);
          expect(mirroredName(name, axis)).toBe(expected === name ? `${name} (Mirror)` : expected);
        }
      }
    }

    expect(swapWords('front rear back', SIDE_WORDS.y)).toBe('rear back front');
    expect(SIDE_WORDS.y.map((rule) => swapWords('front rear back', [rule]))).toEqual([
      'rear front back',
      'back rear front',
    ]);
  });

  it.each([300, 600])('reuses compiled rules throughout %i naming queries', (count) => {
    const constructor = vi.spyOn(globalThis, 'RegExp');

    try {
      for (let i = 0; i < count; i++) {
        expect(mirroredName(`Front bracket ${i}`, 'y')).toBe(`Rear bracket ${i}`);
        expect(swapWords(`left_joint_${i}`, SIDE_WORDS.x)).toBe(`right_joint_${i}`);
      }

      expect(constructor).not.toHaveBeenCalled();
    } finally {
      constructor.mockRestore();
    }
  });
});
