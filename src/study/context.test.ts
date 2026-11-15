import { describe, expect, it } from 'vitest';
import { studyCaseLabel } from './context';

describe('saved Study Case context', () => {
  it('keeps the grading Case visible after switching, closing or renaming the open Case', () => {
    const saved = { id: 'slope', name: 'Climb the Slope' };

    expect(studyCaseLabel(saved, saved)).toBeUndefined();
    expect(studyCaseLabel(saved, { id: 'flag', name: 'Reach the Flag' })).toBe(saved.name);
    expect(studyCaseLabel(saved, null)).toBe(saved.name);
    expect(studyCaseLabel(saved, { ...saved, name: 'Steep Slope' })).toBe(saved.name);
    expect(studyCaseLabel(undefined, saved)).toBeUndefined();
  });
});
