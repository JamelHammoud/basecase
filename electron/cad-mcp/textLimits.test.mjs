import { describe, expect, it } from 'vitest';
import { clipTexts, TEXT_LIMITS } from './textLimits.mjs';

describe('text limits', () => {
  it('cuts long text fields instead of refusing the call', () => {
    const { parts, notice } = clipTexts([{ id: 'head-face', note: 'x'.repeat(900), name: 'Head Face' }]);

    expect(parts[0].note).toHaveLength(TEXT_LIMITS.note);
    expect(parts[0].name).toBe('Head Face');
    expect(notice).toBe('\nCut the note of head-face to 400 characters.');
  });

  it('leaves short fields alone', () => {
    const part = { id: 'a', note: 'M3 inserts' };

    expect(clipTexts([part])).toEqual({ parts: [part], notice: '' });
  });
});
