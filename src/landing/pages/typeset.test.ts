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

  it('leaves code spans and fenced code as written', () => {
    const markdown = "Don't run `echo 'it's'` here.\n\n```sh\nprintf 'can't'\n```\n\nIt's done.";

    expect(typesetMarkdown(markdown)).toBe("Don’t run `echo 'it's'` here.\n\n```sh\nprintf 'can't'\n```\n\nIt’s done.");
  });
});
