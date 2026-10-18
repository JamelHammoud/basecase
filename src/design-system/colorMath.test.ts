import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, normalizeHex } from './colorMath';

describe('colorMath', () => {
  it('normalizes short and long hex', () => {
    expect(normalizeHex(' #ABC ')).toBe('#aabbcc');
    expect(normalizeHex('0D99FF')).toBe('#0d99ff');
    expect(normalizeHex('#12345')).toBeNull();
  });

  it('reads hue, saturation and value', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#0000ff')).toEqual({ h: 240, s: 1, v: 1 });
    expect(hexToHsv('#808080').s).toBe(0);
    expect(hexToHsv('not a colour')).toEqual({ h: 0, s: 0, v: 1 });
  });

  it('round-trips hex through HSV', () => {
    for (const hex of ['#0d99ff', '#ef4444', '#262626', '#ffffff', '#000000', '#ff00ff', '#7fff00']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });
});
