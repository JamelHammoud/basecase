import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_FOLDER_FILES, uploadEvidenceFolder } from './evidenceFiles';
import { platformBridge } from './platformBridge';

afterEach(() => vi.restoreAllMocks());

describe('evidence batch uploads', () => {
  it.each([0, 7, 800, 10_000])(
    'selects supported files in order without inspecting the unused tail of %i files',
    async (count) => {
      let nameReads = 0;
      const files = Array.from({ length: count }, (_, i) => {
        const file = new File([`note ${i}`], `${i}.bin`);

        Object.defineProperty(file, 'name', {
          get: () => {
            nameReads++;

            return i % 2 ? `${i}.txt` : `${i}.bin`;
          },
        });

        return { file, relPath: `${i}.txt` };
      });
      const save = vi.spyOn(platformBridge, 'saveEvidenceFile').mockResolvedValue(undefined);
      const progress = vi.fn();
      const result = await uploadEvidenceFolder({ name: 'Mixed', files }, progress);
      const kept = Math.min(Math.floor(count / 2), MAX_FOLDER_FILES);

      expect(result).toMatchObject({ name: 'Mixed', fileCount: kept, imageCount: 0, skipped: count - kept });
      expect(save.mock.calls.map(([payload]) => ({ relPath: payload.relPath, text: payload.text }))).toEqual(
        Array.from({ length: kept }, (_, i) => ({ relPath: `${i * 2 + 1}.txt`, text: `note ${i * 2 + 1}` })),
      );
      expect(progress.mock.calls).toEqual(Array.from({ length: kept + 1 }, (_, done) => [done, kept]));
      expect(nameReads).toBe(Math.min(count, MAX_FOLDER_FILES * 2) + kept);
      expect(files).toHaveLength(count);
    },
  );

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
