import { describe, expect, it, vi } from 'vitest';
import { highlight } from './highlight';

function highlightWork(code: string, language: string) {
  const trim = String.prototype.trim;
  let characters = 0;
  const spy = vi.spyOn(String.prototype, 'trim').mockImplementation(function (this: string) {
    characters += this.length;

    return trim.call(this);
  });

  try {
    return { tokens: highlight(code, language), characters };
  } finally {
    spy.mockRestore();
  }
}

describe('highlight scan work', () => {
  it.each(['openscad', 'replicad', 'python', 'shell', 'text'])(
    'reads whitespace once in %s while retaining every character',
    (language) => {
      for (const count of [512, 1024]) {
        const gap = ' \t'.repeat(count);
        const code = `${gap}value${gap}= 12${gap}`;
        const { tokens, characters } = highlightWork(code, language);

        expect(tokens.map((token) => token.text).join('')).toBe(code);
        expect(tokens).toEqual([
          { kind: 'plain', text: `${gap}value${gap}= ` },
          { kind: 'number', text: '12' },
          { kind: 'plain', text: gap },
        ]);
        expect(characters).toBeLessThanOrEqual(code.length);
      }
    },
  );
});
