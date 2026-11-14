import { describe, expect, it, vi } from 'vitest';
import type { SavedSceneRecord } from '../../../types/robotics';
import { migrateSceneSummaries, summarizeScene } from './sceneSummary';

describe('scene summary migration', () => {
  it('copies existing scenes one cursor entry at a time without retaining their geometry', () => {
    const scenes = [
      { id: 'arm', name: 'Arm', parts: [{ kind: 'component' }, { hardware: {} }], annotations: [{}] },
      { id: 'empty', name: 'Empty', parts: [], partCount: 0 },
      { id: 'legacy', name: 'Legacy', partCount: 4 },
    ] as unknown as SavedSceneRecord[];
    const put = vi.fn();
    let at = 0;
    const request = { result: null as unknown, onsuccess: null as (() => void) | null };
    const advance = () => {
      const value = scenes[at++];

      request.result = value ? { value, primaryKey: value.id, continue: advance } : null;
      request.onsuccess?.();
    };
    const transaction = {
      objectStore: (name: string) => (name === 'scenes' ? { openCursor: () => request } : { put }),
    } as unknown as IDBTransaction;

    migrateSceneSummaries(transaction);
    advance();

    expect(put.mock.calls).toEqual(scenes.map((scene) => [summarizeScene(scene), scene.id]));
    expect(put.mock.calls.map(([summary]) => summary.partCount)).toEqual([2, 0, 4]);
    expect(put.mock.calls[0][0]).toMatchObject({ catalogCount: 2, commentCount: 1 });

    for (const [summary] of put.mock.calls) {
      expect(summary).not.toHaveProperty('parts');
      expect(summary).not.toHaveProperty('project');
      expect(summary).not.toHaveProperty('annotations');
    }
  });
});
