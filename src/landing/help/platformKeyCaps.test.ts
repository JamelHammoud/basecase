import { describe, expect, it } from 'vitest';
import { showPlatformKeys } from './platformKeyCaps';
import { keyCaps } from './remarkHelp';

const comboOf = (combo: string) => {
  const caps = keyCaps(combo).map((key) => ({ textContent: key }));

  return { caps, querySelectorAll: () => caps };
};

const pageOf = (...combos: string[]) => {
  const found = combos.map(comboOf);

  return { found, root: { querySelectorAll: () => found } as unknown as ParentNode };
};

const shown = (found: ReturnType<typeof comboOf>[]) => found.map(({ caps }) => caps.map((cap) => cap.textContent));

describe('showPlatformKeys', () => {
  it('shows Windows keys on Windows, modifiers first', () => {
    const { found, root } = pageOf('⇧⌘Z', '⌘,', '⌥', '⌫', 'Esc');

    showPlatformKeys(root, false);

    expect(shown(found)).toEqual([['Ctrl', 'Shift', 'Z'], ['Ctrl', ','], ['Alt'], ['Del'], ['Esc']]);
  });

  it('leaves Mac glyphs on a Mac', () => {
    const { found, root } = pageOf('⇧⌘Z');

    showPlatformKeys(root, true);

    expect(shown(found)).toEqual([['⇧', '⌘', 'Z']]);
  });

  it('reads a lone plus as a key', () => {
    expect(keyCaps('+')).toEqual(['+']);
  });
});
