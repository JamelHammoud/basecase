import { describe, expect, it } from 'vitest';
import { exactHexColor, splitHexColors } from './hexColors';

describe('splitHexColors', () => {
  it('finds 3, 4, 6 and 8 digit colors in prose', () => {
    expect(splitHexColors('Use #0d99ff, then #FFF or #12345678.')).toEqual([
      { text: 'Use ' },
      { text: '#0d99ff', color: '#0d99ff' },
      { text: ', then ' },
      { text: '#FFF', color: '#FFF' },
      { text: ' or ' },
      { text: '#12345678', color: '#12345678' },
      { text: '.' },
    ]);
  });

  it('skips issue numbers, anchors, entities and longer words', () => {
    for (const text of ['Fixed in #123', 'see page#fff', '&#123;', 'a/#abc', '#abcdefg', '#fff-ish', '#12345']) {
      expect(splitHexColors(text)).toEqual([{ text }]);
    }
  });

  it('keeps all-digit 6 digit colors and reads a lone color', () => {
    expect(exactHexColor(' #121212 ')).toBe('#121212');
    expect(exactHexColor('#121212 and #fff')).toBeNull();
  });
});
