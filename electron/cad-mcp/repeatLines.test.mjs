import { describe, expect, it } from 'vitest';
import { lineMemory, reportLines } from './repeatLines.mjs';

describe('check_scene repeat suppression', () => {
  it('lists everything on the first call, then leads with what is new', () => {
    const remember = lineMemory();

    expect(reportLines(remember(['a', 'b']), true)).toEqual(['- a', '- b']);
    expect(reportLines(remember(['b', 'c']), false)).toEqual([
      'New since the last check (1):',
      '- c',
      'Still open from the last check (1):',
      '- b',
      'Fixed since the last check: 1.',
    ]);
  });
});
