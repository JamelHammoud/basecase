import { describe, expect, it, vi } from 'vitest';
import { prepareVisionTraining } from './prepare';
import { preparationFixture, preparationSet, preparationTry } from './prepareFixtures';
import { freezeVersion, readDataset } from '../../datasets/datasetFile';

describe('vision training mixed snapshot membership', () => {
  it('freezes image-only membership while preserving mixed working dataset tries', async () => {
    const { dataset, ports } = await preparationFixture();

    dataset.members = ['recording'];
    dataset.samples = [{ tryId: 'recording', from: 2, to: 8 }];

    const resolve = vi.fn(ports.resolve);
    const save = vi.fn(ports.save);
    const result = await prepareVisionTraining(dataset, 'detect', { ports: { ...ports, resolve, save } });

    expect(resolve.mock.calls[0][0].dataset.members).toEqual([]);
    expect(resolve.mock.calls[0][0].dataset.samples).toEqual([]);
    expect(result.version.members).toEqual([]);
    expect(result.version.snapshot!.samples).toEqual([]);
    expect(result.version.imageMembers).toEqual(dataset.imageMembers);
    expect(result.dataset).toEqual({ ...dataset, versions: [result.version] });
    expect(save).toHaveBeenCalledWith(result.dataset);
    expect(readDataset(result.dataset)).toEqual(result.dataset);

    const selected = await prepareVisionTraining({ ...result.dataset, selectedVersion: 1 }, 'detect', {
      ports: { ...ports, resolve, save },
    });

    expect(selected.version.members).toEqual([]);
    expect(selected.dataset.members).toEqual(['recording']);
    expect(selected.dataset.samples).toEqual(dataset.samples);
    expect(resolve).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
  });

  it('preserves complete mixed snapshots when a saved version is selected', async () => {
    const { dataset, ports } = await preparationFixture();

    dataset.members = ['recording'];

    const snapshot = await ports.resolve({ dataset });

    snapshot.modelHash = 'a'.repeat(64);
    snapshot.samples = [
      {
        tryId: 'recording',
        from: 2,
        to: 8,
        recording: 'b'.repeat(64),
        source: 'try:recording',
        split: 'train',
        stored: preparationTry('recording'),
        excluded: [],
      },
    ];

    const frozen = freezeVersion(dataset, await ports.hash(snapshot), 'mixed export', snapshot);
    const result = await prepareVisionTraining({ ...frozen.dataset, selectedVersion: 1 }, 'detect', { ports });

    expect(result.version).toEqual(frozen.version);
    expect(result.version.members).toEqual(['recording']);
    expect(result.snapshot).toEqual(snapshot);
    expect(result.version.snapshot!.samples).toHaveLength(1);
  });
});

describe('vision training preparation', () => {
  it('freezes exact imported splits and labels and restores them after edits', async () => {
    const { dataset, ports, sets } = await preparationFixture();
    const save = vi.fn(ports.save);
    const first = await prepareVisionTraining(dataset, 'detect', { ports: { ...ports, save }, at: 'first' });

    expect(first.samples.map((s) => s.split)).toEqual(['train', 'validation', 'test']);
    expect(first.version.snapshot).toEqual(first.snapshot);
    expect(save).toHaveBeenCalledOnce();
    sets[0].frames[0].annotations[0].instance = 'changed';
    sets[0].frames[0].jpeg[2] = 99;

    const selected = { ...first.dataset, selectedVersion: 1 };
    const repeated = await prepareVisionTraining(selected, 'detect', { ports });

    expect(repeated.sets).toEqual(first.sets);
    expect(repeated.version).toEqual(first.version);
  });

  it('merges class names and remaps training labels without changing frozen originals', async () => {
    const one = preparationSet();
    const two = preparationSet('second');

    two.classes = [{ id: 11, name: 'Block' }];
    two.frames.forEach((frame) => {
      frame.jpeg[2] += 10;
      frame.annotations[0].classId = 11;
    });

    const { dataset, ports } = await preparationFixture([one, two]);
    const result = await prepareVisionTraining(dataset, 'detect', { ports });

    expect(result.classes).toEqual([{ id: 0, name: 'Block' }]);
    expect(result.trainingSets.flatMap((s) => s.frames).map((f) => f.annotations[0].classId)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expect(result.sets[1].frames[0].annotations[0].classId).toBe(11);
  });

  it.each(['model', 'track', 'agent'] as const)('refuses unreviewed %s labels', async (source) => {
    const set = preparationSet();

    set.frames[0].annotations[0].source = source;

    const { dataset, ports } = await preparationFixture([set]);

    await expect(prepareVisionTraining(dataset, 'detect', { ports })).rejects.toThrow('Accept');
  });

  it('refuses suggestions even when their source is manual', async () => {
    const set = preparationSet();

    set.frames[0].annotations[0].review = 'suggested';

    const { dataset, ports } = await preparationFixture([set]);

    await expect(prepareVisionTraining(dataset, 'detect', { ports })).rejects.toThrow('Accept');
  });

  it('refuses identical JPEGs across imported splits even with different labels', async () => {
    const set = preparationSet();

    set.frames[1].jpeg = set.frames[0].jpeg.slice();
    set.frames[1].annotations[0].instance = 'different-label';

    const { dataset, ports } = await preparationFixture([set]);

    await expect(prepareVisionTraining(dataset, 'detect', { ports })).rejects.toThrow('conflicting');
  });

  it('groups all cameras and neighboring frames of derived recording ancestry', async () => {
    const set = preparationSet();

    set.frames.forEach((frame, i) => {
      frame.origin = { tryId: i === 0 ? 'child' : 'grandchild', frame: i, seconds: i / 50 };
      frame.source = 'try';
      frame.camera = i === 0 ? 'left' : 'right';
      frame.split = undefined;
    });

    const manifests = [preparationTry('root'), preparationTry('child', 'root'), preparationTry('grandchild', 'child')];
    const { dataset, ports } = await preparationFixture([set], manifests);
    const result = await prepareVisionTraining(dataset, 'detect', { ports });

    expect(new Set(result.samples.map((s) => s.split)).size).toBe(1);
    expect(result.realSourceIds.sort()).toEqual(['try:child', 'try:grandchild']);
    expect(result.provenance.find((p) => p.source === 'try:grandchild')?.manifests.map((m) => m.id)).toEqual([
      'grandchild',
      'child',
      'root',
    ]);
  });

  it('rejects conflicting ancestry splits and missing or forged source manifests', async () => {
    const set = preparationSet();

    set.frames[0].source = 'try';
    set.frames[0].origin = { tryId: 'child', frame: 0, seconds: 0 };

    const { dataset, ports } = await preparationFixture([set], [preparationTry('child', 'missing')]);

    await expect(prepareVisionTraining(dataset, 'detect', { ports })).rejects.toThrow('source');
    ports.manifests = async () => [{ ...preparationTry('child'), source: 'forged' as 'real' }];
    await expect(prepareVisionTraining(dataset, 'detect', { ports })).rejects.toThrow('source');
  });

  it('does not treat simulated extracted frames as real evaluation evidence', async () => {
    const set = preparationSet();

    set.frames[2].source = 'try';
    set.frames[2].origin = { tryId: 'sim', frame: 2, seconds: 0.04 };

    const sim = { ...preparationTry('sim'), source: 'case' as const };
    const { dataset, ports } = await preparationFixture([set], [sim]);
    const result = await prepareVisionTraining(dataset, 'detect', { ports });

    expect(result.realSourceIds).toEqual([]);
    expect(result.realTestSources).toEqual([]);
  });

  it('refuses saved frozen split leakage rather than changing its version', async () => {
    const { dataset, ports } = await preparationFixture();
    const first = await prepareVisionTraining(dataset, 'detect', { ports });
    const snapshot = first.version.snapshot!;

    snapshot.images[1].source = snapshot.images[0].source;
    first.version.hash = await ports.hash(snapshot);
    ports.restore = async () => first.sets;

    await expect(prepareVisionTraining({ ...first.dataset, selectedVersion: 1 }, 'detect', { ports })).rejects.toThrow(
      'conflicting',
    );
  });
});
