import { describe, expect, it } from 'vitest';
import { negative, signed } from './minus.mjs';

const tenths = (v) => v.toFixed(1);

describe('negative', () => {
  it('writes a negative number with a minus sign, never a hyphen', () => {
    expect(negative(-2.34, tenths)).toBe('−2.3');
    expect(negative(2.34, tenths)).toBe('2.3');
  });

  it('drops the sign when the shown figures round to zero', () => {
    expect(negative(-0.01, tenths)).toBe('0.0');
    expect(negative(-0, String)).toBe('0');
  });
});

describe('signed', () => {
  it('writes a plus or a minus sign', () => {
    expect(signed(1.26, tenths)).toBe('+1.3');
    expect(signed(-1.26, tenths)).toBe('−1.3');
  });

  it('reads a change that rounds to zero as +0', () => {
    expect(signed(-0.01, tenths)).toBe('+0.0');
    expect(signed(0, tenths)).toBe('+0.0');
  });
});
