import { describe, expect, it } from 'vitest';
import { prepareVisionTraining } from './prepare';
import { preparationFixture, preparationSet, preparationTry } from './prepareFixtures';
import { readImageSource } from '../import/readImageSource';
import { jsonBytes } from '../imageBytes';

describe('training preparation input fidelity', () => {
  it('retains standard Roboflow COCO classes, boxes, and every imported split', async () => {
    const files: Record<string, Uint8Array> = {};

    ['train', 'valid', 'test'].forEach((split, i) => {
      const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 4, 0, 4, 1, 1, 17, i, 255, 217]);

      files[`${split}/image.jpg`] = jpeg;
      files[`${split}/_annotations.coco.json`] = jsonBytes({
        categories: [{ id: 7, name: 'Block' }],
        images: [{ id: 1, file_name: 'image.jpg', width: 4, height: 4 }],
        annotations: [{ id: 1, image_id: 1, category_id: 7, bbox: [i, 0, 1, 1] }],
      });
    });

    const set = await readImageSource({
      name: 'Roboflow',
      files: Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length, read: async () => bytes })),
    });

    expect(set).not.toBeNull();

    const { dataset, ports } = await preparationFixture([set!]);
    const result = await prepareVisionTraining(dataset, 'detect', { ports });

    expect(result.classes).toEqual([{ id: 0, name: 'Block' }]);
    expect(result.samples.map((sample) => sample.split).sort()).toEqual(['test', 'train', 'validation']);
    expect(result.sets[0].frames.map((frame) => frame.annotations[0].box).sort()).toEqual([
      [0, 0, 1, 1],
      [1, 0, 1, 1],
      [2, 0, 1, 1],
    ]);
  });

  it('accepts reviewed suggestions and preserves named keypoints in merged classes', async () => {
    const set = preparationSet();

    set.classes[0].keypoints = ['grip'];
    set.frames.forEach((frame) => {
      frame.annotations[0].source = 'model';
      frame.annotations[0].review = 'accepted';
      frame.annotations[0].keypoints = [{ name: 'grip', x: 0, y: 0, visible: true }];
    });

    const { dataset, ports } = await preparationFixture([set]);
    const result = await prepareVisionTraining(dataset, 'keypoints', { ports });

    expect(result.classes[0].keypoints).toEqual(['grip']);
    expect(result.trainingSets[0].frames[0].annotations[0].keypoints).toEqual([
      { name: 'grip', x: 0, y: 0, visible: true },
    ]);
  });

  it('refuses keypoint training without a visible keypoint', async () => {
    const { dataset, ports } = await preparationFixture();

    await expect(prepareVisionTraining(dataset, 'keypoints', { ports })).rejects.toThrow('keypoints');
  });

  it('requires two classes and exactly one annotation per classification image', async () => {
    const set = preparationSet();
    const single = await preparationFixture([set]);

    await expect(prepareVisionTraining(single.dataset, 'classify', { ports: single.ports })).rejects.toThrow(
      'two classes',
    );
    set.classes.push({ id: 5, name: 'Mug' });
    set.frames[1].annotations[0].classId = 5;

    const one = await preparationFixture([set]);

    await expect(prepareVisionTraining(one.dataset, 'classify', { ports: one.ports })).resolves.toHaveProperty(
      'classes',
    );
    set.frames[0].annotations.push({ ...set.frames[0].annotations[0], instance: 'other' });

    const multiple = await preparationFixture([set]);

    await expect(prepareVisionTraining(multiple.dataset, 'classify', { ports: multiple.ports })).rejects.toThrow(
      'one annotation',
    );
  });

  it('refuses conflicting camera splits in a recording ancestry before saving a version', async () => {
    const set = preparationSet();

    set.frames.slice(0, 2).forEach((frame, i) => {
      frame.origin = { tryId: i ? 'child' : 'root', frame: i, seconds: i / 50 };
      frame.source = 'try';
    });

    const { dataset, ports } = await preparationFixture(
      [set],
      [preparationTry('root'), preparationTry('child', 'root')],
    );

    await expect(prepareVisionTraining(dataset, 'detect', { ports })).rejects.toThrow('conflicting');
    expect(dataset.versions).toEqual([]);
  });

  it('excludes simulated descendants of real recordings from real evaluation evidence', async () => {
    const set = preparationSet();

    set.frames[2].origin = { tryId: 'child', frame: 2, seconds: 0.04 };
    set.frames[2].source = 'try';

    const manifests = [preparationTry('root'), { ...preparationTry('child', 'root'), source: 'generated' as const }];
    const { dataset, ports } = await preparationFixture([set], manifests);
    const prepared = await prepareVisionTraining(dataset, 'detect', { ports });

    expect(prepared.realSourceIds).toEqual([]);
    expect(prepared.provenance[0].manifests.map((manifest) => manifest.source)).toEqual(['generated', 'operate']);
  });

  it('records eligible real test evidence and detects changes to a saved version', async () => {
    const set = preparationSet();

    set.frames[2].origin = { tryId: 'real', frame: 2, seconds: 0.04 };
    set.frames[2].source = 'try';

    const { dataset, ports } = await preparationFixture([set], [preparationTry('real')]);
    const result = await prepareVisionTraining(dataset, 'detect', { ports });

    expect(result.realTestSources).toEqual(['try:real']);
    result.version.snapshot!.images[2].split = 'train';

    await expect(prepareVisionTraining({ ...result.dataset, selectedVersion: 1 }, 'detect', { ports })).rejects.toThrow(
      'version changed',
    );
  });
});
