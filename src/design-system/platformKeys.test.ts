import { describe, expect, it } from 'vitest';
import { modifierName, platformKeys } from './platformKeys';

describe('platformKeys', () => {
  it('keeps Mac glyphs on a Mac', () => {
    expect(platformKeys(['⇧', '⌘', 'Z'], true)).toEqual(['⇧', '⌘', 'Z']);
  });

  it('draws Return as text on a Mac and names it Enter on Windows, however it was written', () => {
    expect(platformKeys(['⌘', '↩'], true)).toEqual(['⌘', '↩\uFE0E']);
    expect(platformKeys(['↩\uFE0E'], true)).toEqual(['↩\uFE0E']);
    expect(platformKeys(['↩\uFE0E'], false)).toEqual(['Enter']);
  });

  it('names modifiers in Windows order', () => {
    expect(platformKeys(['⇧', '⌘', 'Z'], false)).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(platformKeys(['⌘', '1', '–', '8'], false)).toEqual(['Ctrl', '1', '–', '8']);
    expect(platformKeys(['⌫'], false)).toEqual(['Del']);
    expect(platformKeys(['⌘', '↩'], false)).toEqual(['Ctrl', 'Enter']);
    expect(modifierName('⌥', false)).toBe('Alt');
  });
});
