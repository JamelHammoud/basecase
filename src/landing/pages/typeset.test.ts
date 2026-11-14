import { describe, expect, it } from 'vitest';
import { typeset, typesetMarkdown } from './typeset';

describe('typeset', () => {
  it('sets an apostrophe between letters as ’', () => {
    expect(typeset("Build guide won't make or open")).toBe('Build guide won’t make or open');
    expect(typeset("the robot's cameras")).toBe('the robot’s cameras');
  });

  it('leaves quotes that open or close a word', () => {
    expect(typeset("'quoted' and robots' joints")).toBe("'quoted' and robots' joints");
  });

  it('sets a hyphen before a figure as a minus sign', () => {
    expect(typeset('limited to -90° to 45°, comes in as -120° to 15°')).toBe(
      'limited to −90° to 45°, comes in as −120° to 15°',
    );
    expect(typeset('| 1, or -1 when |')).toBe('| 1, or −1 when |');
  });

  it('leaves hyphens inside words, ranges and dates', () => {
    expect(typeset('SO-101, pages 3-4, 2026-11-13 and a - list')).toBe('SO-101, pages 3-4, 2026-11-13 and a - list');
  });

  it('leaves code spans and fenced code as written', () => {
    const markdown = "Don't run `echo 'it's'` here.\n\n```sh\nprintf 'can't'\n```\n\nIt's done.";

    expect(typesetMarkdown(markdown)).toBe("Don’t run `echo 'it's'` here.\n\n```sh\nprintf 'can't'\n```\n\nIt’s done.");
  });
});
