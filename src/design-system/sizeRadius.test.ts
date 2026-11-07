import { describe, expect, it } from 'vitest';
import { sizeRadius } from './sizeRadius';

describe('sizeRadius', () => {
  it('keeps the size radius by default', () => {
    expect(sizeRadius('rounded-lg', 'pl-3 pr-2')).toBe('rounded-lg');
  });

  it('keeps it for a single-corner override, which only changes that corner', () => {
    expect(sizeRadius('rounded-lg', 'rounded-bl-[16px]')).toBe('rounded-lg');
  });

  it('drops it for rounded-full, which would lose to it in the stylesheet', () => {
    expect(sizeRadius('rounded-lg', 'rounded-full pl-3')).toBe('');
    expect(sizeRadius('rounded-lg', '!rounded-full')).toBe('');
  });
});
