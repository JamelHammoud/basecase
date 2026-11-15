import fs from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from './files.mjs';

afterEach(() => vi.restoreAllMocks());

it('refuses a linked source file before opening or reading bytes on every platform', async () => {
  const link = { isFile: () => false, isSymbolicLink: () => true };
  const stat = vi.spyOn(fs, 'lstat').mockResolvedValue(link);
  const open = vi.spyOn(fs, 'open');
  const read = vi.spyOn(fs, 'readFile');

  await expect(readFile('linked-content', 64 * 1024 * 1024)).rejects.toThrow('regular file');
  expect(stat).toHaveBeenCalledWith('linked-content');
  expect(open).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
