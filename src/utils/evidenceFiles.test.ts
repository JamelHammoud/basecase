import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_FOLDER_FILES, uploadEvidenceFolder } from './evidenceFiles';
import { platformBridge } from './platformBridge';

afterEach(() => vi.restoreAllMocks());

describe('evidence batch uploads', () => {
  it('keeps four saves active and counts failed, unsupported and over-limit files as skipped', async () => {
    const files = Array.from({ length: MAX_FOLDER_FILES + 3 }, (_, i) => ({
      file: new File([`note ${i}`], `${i}.txt`),
      relPath: `${i}.txt`,
    }));
    const seen: string[] = [];
    let active = 0;
    let peak = 0;

    vi.spyOn(platformBridge, 'saveEvidenceFile').mockImplementation(async (payload) => {
      seen.push(payload.relPath);
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;

      if (payload.relPath === '2.txt') throw new Error('disk full');

      expect(payload.text).toBe(`note ${payload.relPath.replace('.txt', '')}`);
    });

    const progress = vi.fn();
    const result = await uploadEvidenceFolder(
      { name: 'Notes', files: [{ file: new File(['x'], 'other.bin'), relPath: 'other.bin' }, ...files] },
      progress,
    );

    expect(result).toMatchObject({ name: 'Notes', fileCount: 399, imageCount: 0, skipped: 5 });
    expect(peak).toBe(4);
    expect(active).toBe(0);
    expect(seen).toEqual(files.slice(0, MAX_FOLDER_FILES).map((file) => file.relPath));
    expect(progress.mock.calls).toEqual(Array.from({ length: 401 }, (_, done) => [done, 400]));
  });
});
