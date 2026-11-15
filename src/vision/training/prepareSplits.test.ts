import { describe, expect, it } from 'vitest';
import { freezeVersion } from '../../datasets/datasetFile';
import { prepareVisionTraining } from './prepare';
import { preparationFixture, preparationSet, preparationTry } from './prepareFixtures';

function recordingSet(id = 'recording', tryId = 'real') {
  const set = preparationSet(id);

  set.frames.forEach((frame, index) => {
    frame.split = undefined;
    frame.jpeg[2] += 20;
    frame.source = 'try';
    frame.camera = index % 2 ? 'wrist' : 'room';
    frame.origin = { tryId, frame: index, seconds: index / 50 };
  });

  return set;
}

describe('real recording test reservation', () => {
  it('chooses the same eligible root group when member order changes', async () => {
    const first = recordingSet('first', 'first-real');
    const second = recordingSet('second', 'second-real');

    second.frames.forEach((frame) => {
      frame.jpeg[2] += 40;
    });

    const manifests = [preparationTry('first-real'), preparationTry('second-real')];
    const forward = await preparationFixture([first, second], manifests);
    const reversed = await preparationFixture([second, first], manifests);
    const one = await prepareVisionTraining(forward.dataset, 'detect', { ports: forward.ports });
    const two = await prepareVisionTraining(reversed.dataset, 'detect', { ports: reversed.ports });

    expect(one.realTestSources).toHaveLength(1);
    expect(two.realTestSources).toEqual(one.realTestSources);
  });

  it('reserves a separate real recording while leaving rendered train and validation images available', async () => {
    const rendered = preparationSet('rendered');

    rendered.frames = rendered.frames.slice(0, 2);

    const real = recordingSet();
    const { dataset, ports } = await preparationFixture([rendered, real], [preparationTry('real')]);
    const result = await prepareVisionTraining(dataset, 'detect', { ports });

    expect(result.samples.map((sample) => sample.split)).toEqual(['train', 'validation', 'test', 'test', 'test']);
    expect(result.realTestSources).toEqual(['try:real']);
    expect(result.version.snapshot!.images).toEqual(result.samples);
    expect(result.samples.slice(2).every((sample) => sample.explicit === undefined)).toBe(true);
  });

  it('assigns remaining unassigned source groups to train and validation after reserving the test recording', async () => {
    const rendered = preparationSet('rendered');

    rendered.frames.forEach((frame) => {
      frame.split = undefined;
    });

    const { dataset, ports } = await preparationFixture([rendered, recordingSet()], [preparationTry('real')]);
    const first = await prepareVisionTraining(dataset, 'detect', { ports });
    const second = await prepareVisionTraining(dataset, 'detect', { ports });

    expect(first.samples.map((sample) => sample.split)).toEqual(second.samples.map((sample) => sample.split));
    expect(new Set(first.samples.slice(0, 3).map((sample) => sample.split))).toEqual(new Set(['train', 'validation']));
    expect(first.samples.slice(3).map((sample) => sample.split)).toEqual(['test', 'test', 'test']);
  });

  it('never reserves a real group joined to generated frames by duplicate JPEGs', async () => {
    const rendered = preparationSet('rendered');
    const real = recordingSet();

    real.frames[0].jpeg = rendered.frames[0].jpeg.slice();

    const { dataset, ports } = await preparationFixture([rendered, real], [preparationTry('real')]);
    const result = await prepareVisionTraining(dataset, 'detect', { ports });

    expect(result.realSourceIds).toEqual([]);
    expect(result.realTestSources).toEqual([]);
    expect(result.samples.slice(3).every((sample) => sample.split === 'train')).toBe(true);
  });

  it('keeps explicit real train assignments and existing eligible real test reservations', async () => {
    const real = recordingSet();

    real.frames.forEach((frame) => {
      frame.split = 'train';
    });

    const explicit = recordingSet('explicit', 'test-real');

    explicit.frames.forEach((frame) => {
      frame.split = 'test';
      frame.jpeg[2] += 30;
    });

    const unassigned = recordingSet('unassigned', 'other-real');

    unassigned.frames.forEach((frame) => {
      frame.jpeg[2] += 60;
    });

    const { dataset, ports } = await preparationFixture(
      [real, explicit, unassigned],
      [preparationTry('real'), preparationTry('test-real'), preparationTry('other-real')],
    );
    const result = await prepareVisionTraining(dataset, 'detect', { ports });

    expect(result.samples.slice(0, 3).every((sample) => sample.split === 'train')).toBe(true);
    expect(result.realTestSources).toEqual(['try:test-real']);
    expect(result.samples.slice(6).every((sample) => sample.split !== 'test')).toBe(true);
  });

  it('leaves a saved snapshot without real test assignments unchanged', async () => {
    const { dataset, ports } = await preparationFixture([preparationSet(), recordingSet()], [preparationTry('real')]);
    const snapshot = await ports.resolve({ dataset });

    snapshot.images = snapshot.images.map((sample) =>
      sample.frameSetId === 'recording' ? { ...sample, split: 'train' as const } : sample,
    );

    const frozen = freezeVersion(dataset, await ports.hash(snapshot), 'before reservation', snapshot);
    const result = await prepareVisionTraining({ ...frozen.dataset, selectedVersion: 1 }, 'detect', { ports });

    expect(result.snapshot).toEqual(snapshot);
    expect(result.realTestSources).toEqual([]);
    expect(result.version.hash).toBe(frozen.version.hash);
  });
});
