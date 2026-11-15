import { describe, expect, it, vi } from 'vitest';
import { storedTryOf, summaryOf, type StoredTry } from '../../../cases/tryFile';
import type { TryRecord } from '../../../cases/tries';
import { sampleExclusions } from '../../../datasets/datasetSnapshot';
import { DEFAULT_PROJECT, type ProjectSettings } from '../../../types/robotics';
import type { StudioContext } from '../types';
import casesStudio from './cases';

const library = vi.hoisted(() => new Map<string, StoredTry>());

vi.mock('../../../cases/tryStore/desktopTries', () => ({
  desktopTries: {
    list: async () => [...library.values()].map((stored) => summaryOf(stored, { recording: true, strip: false })),
    manifests: async (ids: string[]) => ids.flatMap((id) => library.get(id) ?? []),
    update: async (stored: StoredTry) => {
      library.set(stored.id, structuredClone(stored));

      return true;
    },
  },
}));

const record: TryRecord = {
  id: 'try-fixture',
  caseId: 'touch-a-point',
  robot: 'Arm',
  at: '2026-11-15T00:00:00Z',
  passed: false,
  margin: -1,
  seconds: 0.4,
  manifest: { formatVersion: 1, caseHash: 'c', modelHash: 'm', seed: 0, frames: 20, dt: 0.02 },
};

describe('passed try fixtures', () => {
  it('persists the verdict used by dataset snapshots and retains the scene record', async () => {
    const { loadManifests, loadTries } = await import('../../../cases/tryStore');
    const stored = storedTryOf(record, { sceneId: 'scene-a', caseName: 'Touch a Point', joints: ['shoulder'] });
    const other = { ...stored, id: 'try-other' };
    let project: ProjectSettings = { ...DEFAULT_PROJECT, tries: [record] };
    const context = {
      core: {
        docs: {
          projectRef: { current: project },
          setProject: (patch: (value: ProjectSettings) => ProjectSettings) => {
            project = patch(project);
          },
        },
      },
    } as unknown as StudioContext;

    library.set(stored.id, stored);
    library.set(other.id, other);
    expect(sampleExclusions(stored, 'm')).toEqual(['verdict:failed']);
    await casesStudio(() => context).passTries();

    const [saved] = await loadManifests([record.id]);

    expect(saved).toEqual({ ...stored, outcome: { verdict: 'passed', margin: -1, by: 'person' } });
    expect(sampleExclusions(saved, 'm')).toEqual([]);
    expect(project.tries).toEqual([{ ...record, passed: true }]);
    expect((await loadTries()).find((entry) => entry.id === record.id)?.outcome.verdict).toBe('passed');
    expect(library.get(other.id)).toEqual(other);
  });
});
