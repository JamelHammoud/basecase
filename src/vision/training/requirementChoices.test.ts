import { expect, it, vi } from 'vitest';
import { newDataset, freezeVersion } from '../../datasets/datasetFile';
import { datasetContentHash } from '../../datasets/contentHash';
import { frameSetHash } from '../frameSet';
import { manifestOf } from '../frameSetStoreTypes';
import { packImageSnapshots } from '../imageSnapshot';
import { imageGroups } from '../conditions';
import { metricSet } from './metricsFixtures';
import { requirementChoices } from './requirementChoices';

it('keeps frozen camera and class choices when group fields and legacy class summaries are absent', async () => {
  const set = metricSet();

  set.frames.push({ ...structuredClone(set.frames[0]), id: 'two', camera: 'wrist' });

  const member = { frameSetId: set.id, frameIds: set.frames.map((frame) => frame.id), hash: await frameSetHash(set) };
  const packed = await packImageSnapshots(set, member);
  const content = new Map<string, Uint8Array>();
  const images = [];

  for (const entry of packed) {
    const hash = await datasetContentHash(entry.bytes);

    content.set(hash, entry.bytes);
    images.push({ ...entry.sample, content: hash });
  }

  const original = newDataset({
    id: 'choices',
    name: 'Choices',
    task: '',
    members: [],
    imageMembers: [member],
    at: set.createdAt,
  });
  const frozen = freezeVersion(original, 'a'.repeat(64), set.createdAt, {
    task: '',
    modelHash: '',
    samples: [],
    images,
  });
  const dataset = { ...frozen.dataset, selectedVersion: frozen.version.n };
  const ports = {
    manifest: vi.fn(async () => manifestOf(set)),
    content: vi.fn(async (hash: string) => content.get(hash)!.slice()),
  };

  expect(images.every((sample) => sample.groups === undefined)).toBe(true);
  set.frames.forEach((frame) => {
    frame.camera = 'edited';
  });
  set.classes = [{ id: 9, name: 'Edited' }];

  expect(await requirementChoices(dataset, ports)).toEqual({
    groups: [
      { kind: 'camera', name: 'camera' },
      { kind: 'camera', name: 'wrist' },
    ],
    classes: ['Cup', 'Plate'],
  });
  expect(ports.manifest).not.toHaveBeenCalled();
  expect(ports.content).toHaveBeenCalledTimes(2);
  expect(await requirementChoices({ ...dataset, selectedVersion: undefined }, ports)).toEqual({
    groups: [{ kind: 'camera', name: 'edited' }],
    classes: ['Edited'],
  });

  dataset.versions[0].imageMembers![0].classes = ['Cup', 'Plate'];
  dataset.versions[0].snapshot!.images.forEach((sample, index) => {
    sample.groups = imageGroups(metricSet(), { ...metricSet().frames[0], camera: index ? 'wrist' : 'camera' });
  });
  ports.content.mockClear();

  expect((await requirementChoices(dataset, ports)).classes).toEqual(['Cup', 'Plate']);
  expect(ports.content).not.toHaveBeenCalled();
});
