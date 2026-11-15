import { describe, expect, it, vi } from 'vitest';
import { encodeRecording } from '../../cases/recordingFile';
import { touchTheDots } from '../../cases/testing';
import { keepTries } from '../../cases/tryStore';
import { datasetContentHash } from '../../datasets/contentHash';
import { newDataset } from '../../datasets/datasetFile';
import { resolveSnapshot, restoreSamples } from '../../datasets/datasetSnapshot';
import { canTrain } from '../../datasets/demos';
import { fixtureModel, fixtureRobot } from '../../skills/fixtureModels';
import { triesJob } from '../../skills/triesTraining';
import { seedDatasetTry } from './datasetFixture';

vi.mock(import('../../cases/tryStore'), async (importOriginal) => ({
  ...(await importOriginal()),
  keepTries: vi.fn(async () => {}),
}));

describe('dataset recording fixtures', () => {
  it('freezes five distinct, trainable recordings with training and validation sources', async () => {
    const model = fixtureModel('arm-3dof');

    for (let i = 0; i < 5; i++) await seedDatasetTry(model, 'scene', `training-${i}`, i);

    const entries = vi.mocked(keepTries).mock.calls.flatMap(([given]) => given);
    const byId = new Map(entries.map((entry) => [entry.stored.id, entry]));
    const content = new Map<string, Uint8Array>();
    const snapshot = await resolveSnapshot({
      dataset: newDataset({ id: 'training', name: 'Training', task: 'Move', members: [...byId.keys()], at: 'now' }),
      model,
      ports: {
        manifests: async (ids) => ids.map((id) => byId.get(id)!.stored),
        bytes: async (id) => encodeRecording(byId.get(id)!.recording!),
        save: async (bytes) => {
          const hash = await datasetContentHash(bytes);

          content.set(hash, bytes);

          return hash;
        },
      },
    });
    const restored = await restoreSamples(snapshot, async (hash) => content.get(hash) ?? null);

    expect(restored).toHaveLength(5);
    expect(restored.every(({ recording }) => canTrain(recording, model))).toBe(true);
    expect(new Set(snapshot.samples.map((sample) => sample.recording)).size).toBe(5);
    expect(snapshot.samples.every((sample) => sample.excluded.length === 0)).toBe(true);

    const job = triesJob(
      model,
      touchTheDots(fixtureRobot('arm-3dof')),
      restored.map(({ recording }) => recording),
      restored.map(({ sample }) => sample.split),
    );
    const demos = job.job.demos as { episodes: Array<{ split: string; obs: number[][]; actions: number[][] }> };

    expect(demos.episodes).toHaveLength(5);
    expect(demos.episodes.map((episode) => episode.split)).toContain('train');
    expect(demos.episodes.map((episode) => episode.split)).toContain('validation');
    expect(
      demos.episodes.every((episode) => episode.obs.length > 0 && episode.actions.length === episode.obs.length),
    ).toBe(true);
  });
});
