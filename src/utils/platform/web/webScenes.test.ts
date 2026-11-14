import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedSceneRecord } from '../../../types/robotics';
import { idbAll, idbGet, idbWrite } from './idb';
import { summarizeScene } from './sceneSummary';
import { deleteScene, getScene, listScenes, saveScene, saveScenePreview } from './webScenes';

vi.mock('./idb', () => ({ idbAll: vi.fn(), idbGet: vi.fn(), idbWrite: vi.fn() }));

const record = {
  id: 'arm',
  name: 'Arm',
  globalGoal: 'Sort blocks',
  updatedAt: '2026-10-31T00:00:00.000Z',
  partCount: 3,
  parts: [{ kind: 'component' }, { kind: 'cube', hardware: { type: 'socket' } }, { kind: 'cube' }],
  annotations: [{}],
  previewDataUrl: 'data:image/png;base64,old',
  sizeMm: [100, 200, 300],
} as unknown as SavedSceneRecord;

beforeEach(() => vi.resetAllMocks());

describe('web scene summaries', () => {
  it('lists summaries newest first without reading full scene records', async () => {
    const older = summarizeScene(record);
    const newer = { ...older, id: 'rover', updatedAt: '2026-11-01T00:00:00.000Z' };

    vi.mocked(idbAll).mockResolvedValue([older, newer]);

    expect(await listScenes()).toEqual([newer, older]);
    expect(idbAll).toHaveBeenCalledExactlyOnceWith('sceneSummaries');
    expect(idbGet).not.toHaveBeenCalled();
  });

  it('saves the full record and its matching summary in one write', async () => {
    vi.mocked(idbGet).mockResolvedValue(summarizeScene(record));

    const summary = await saveScene({ ...record, name: 'Sorting arm', keepUpdatedAt: true });
    const next = { ...record, name: 'Sorting arm', chatId: undefined, project: undefined };

    expect(summary).toEqual(summarizeScene(next));
    expect(idbWrite).toHaveBeenCalledExactlyOnceWith([
      { kind: 'put', store: 'scenes', key: 'arm', value: next },
      { kind: 'put', store: 'sceneSummaries', key: 'arm', value: summary },
    ]);
    expect(idbAll).not.toHaveBeenCalled();
    expect(idbGet).toHaveBeenCalledExactlyOnceWith('sceneSummaries', 'arm');
  });

  it('preserves a previous preview from its summary when autosaving new parts', async () => {
    vi.mocked(idbGet).mockResolvedValue(summarizeScene(record));

    const summary = await saveScene({ id: 'arm', name: 'Arm', parts: [], autosave: true });

    expect(summary).toMatchObject({ partCount: 0, previewDataUrl: record.previewDataUrl, sizeMm: record.sizeMm });
    expect(idbGet).toHaveBeenCalledExactlyOnceWith('sceneSummaries', 'arm');
  });

  it('keeps previews and dimensions in both records without changing the saved time', async () => {
    vi.mocked(idbGet).mockResolvedValue(record);

    const preview = {
      id: 'arm',
      previewDataUrl: 'data:image/png;base64,new',
      sizeMm: [4, 5, 6] as [number, number, number],
    };
    const next = { ...record, ...preview };
    const summary = await saveScenePreview(preview);

    expect(summary).toEqual(summarizeScene(next));
    expect(idbWrite).toHaveBeenCalledExactlyOnceWith([
      { kind: 'put', store: 'scenes', key: 'arm', value: next },
      { kind: 'put', store: 'sceneSummaries', key: 'arm', value: summary },
    ]);
    expect(idbAll).not.toHaveBeenCalled();
  });

  it('deletes both records and ignores autosaves and previews for the deleted scene', async () => {
    vi.mocked(idbAll).mockResolvedValue([]);

    expect(await deleteScene('deleted-arm')).toEqual([]);
    expect(idbWrite).toHaveBeenCalledExactlyOnceWith([
      { kind: 'delete', store: 'scenes', key: 'deleted-arm' },
      { kind: 'delete', store: 'sceneSummaries', key: 'deleted-arm' },
    ]);
    expect(await saveScene({ ...record, id: 'deleted-arm', autosave: true })).toBeNull();
    expect(await saveScenePreview({ id: 'deleted-arm' })).toBeNull();
    expect(idbWrite).toHaveBeenCalledOnce();
  });

  it('reads a full scene on demand', async () => {
    vi.mocked(idbGet).mockResolvedValue(record);

    expect(await getScene('arm')).toBe(record);
    expect(idbGet).toHaveBeenCalledExactlyOnceWith('scenes', 'arm');
  });
});
