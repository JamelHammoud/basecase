import { describe, expect, it } from 'vitest';
import { GB, KB, MB, fileSize } from './fileSize.mjs';

describe('fileSize', () => {
  it('shows tenths under 10 without a trailing zero, then whole units', () => {
    expect(fileSize(1.5 * MB)).toBe('1.5 MB');
    expect(fileSize(8 * MB)).toBe('8 MB');
    expect(fileSize(64 * KB)).toBe('64 KB');
    expect(fileSize(256 * KB)).toBe('256 KB');
    expect(fileSize(600 * MB)).toBe('600 MB');
    expect(fileSize(4 * GB)).toBe('4 GB');
  });

  it('moves up a unit instead of reading 1024 of the one below', () => {
    expect(fileSize(1023 * KB)).toBe('1023 KB');
    expect(fileSize(MB - 100)).toBe('1 MB');
  });

  it('counts bytes under a kilobyte', () => {
    expect(fileSize(0)).toBe('0 bytes');
    expect(fileSize(1)).toBe('1 byte');
    expect(fileSize(512)).toBe('512 bytes');
  });
});
