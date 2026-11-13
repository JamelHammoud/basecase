import { describe, expect, it } from 'vitest';
import { renamedTo } from './renamedTo';

describe('renamedTo', () => {
  it('keeps a new name, trimmed', () => {
    expect(renamedTo('Arm', '  Left arm ')).toBe('Left arm');
  });

  it('keeps the old name when the draft is blank, unchanged or cancelled', () => {
    expect(renamedTo('Arm', '   ')).toBeNull();
    expect(renamedTo('Arm', ' Arm ')).toBeNull();
    expect(renamedTo('Arm', null)).toBeNull();
  });
});
