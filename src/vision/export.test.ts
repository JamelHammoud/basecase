import { describe, expect, it } from 'vitest';
import { splitOf } from '../datasets/datasetSplit';
import { exportCoco, importCoco } from './coco';
import { exportYolo, importYolo } from './yolo';
import { visionFixture } from './fixtures';
import { mergeFrameSets } from './mergeFrameSets';
import { hashFrame, hashFrameSet } from './frameSet';
import { annotationsForRaster } from '../cameras/labelPixels';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('vision exports', () => {
  it('exports a ring mask as one outer YOLO segment and preserves its hole in the sidecar', () => {
    const raster = Uint32Array.from({ length: 25 }, (_, i) => (i < 5 || i >= 20 || i % 5 === 0 || i % 5 === 4 ? 1 : 0));
    const original = visionFixture();
    const annotations = annotationsForRaster({
      raster,
      width: 5,
      height: 5,
      instances: [{ id: 1, partId: 'handle', classId: 7, keypoints: {} }],
      keypoints: {},
    });
    const content = { ...original.frames[0], width: 5, height: 5, depth: new Float32Array(25), annotations };
    const frame = { ...content, id: hashFrame(content) };
    const set = { ...original, frames: [frame] };

    set.id = hashFrameSet(set);

    const files = exportYolo(set);
    const labels = text(files[`segment/labels/train/${frame.id}.txt`]).trim().split('\n');

    expect(annotations[0].polygons).toHaveLength(2);
    expect(labels).toEqual(['0 0 0 1 0 1 1 0 1']);
    expect(importYolo(files)).toEqual(set);
    expect(importYolo(files)?.frames[0].annotations[0].mask).toEqual(annotations[0].mask);
  });

  it('writes COCO boxes, RLE, categories and named keypoints with an exact round trip', () => {
    const set = visionFixture(7);
    const files = exportCoco(set);
    const coco = JSON.parse(text(files['annotations/instances_train.json']));
    const split = splitOf(
      set.frames.map((f) => f.id),
      set.seed,
    );

    expect(coco.images.map((i: { basecase_id: string }) => i.basecase_id)).toEqual(split.train);
    expect(coco.categories).toEqual([
      { id: 7, name: 'Cube', supercategory: 'box', keypoints: ['center'], skeleton: [] },
    ]);
    expect(coco.annotations[0]).toMatchObject({
      category_id: 7,
      bbox: [1, 0, 2, 2],
      segmentation: { size: [3, 4], counts: [3, 2, 1, 2, 4] },
      keypoints: [2, 1, 2],
      num_keypoints: 1,
      area: 4,
    });
    expect(new Set(coco.annotations.map((a: { id: number }) => a.id)).size).toBe(coco.annotations.length);
    expect(importCoco(files)).toEqual(set);
    expect(JSON.parse(text(files['annotations/instances_test.json'])).images).toEqual([]);
  });

  it('writes contiguous YOLO class ids and normalized visible boxes with an exact round trip', () => {
    const set = visionFixture(7);
    const files = exportYolo(set);
    const frame = set.frames[0];
    const split = splitOf(
      set.frames.map((f) => f.id),
      set.seed,
    );
    const folder = split.train.includes(frame.id) ? 'train' : 'val';

    expect(text(files[`labels/${folder}/${frame.id}.txt`])).toBe('0 0.5 0.3333333333333333 0.5 0.6666666666666666\n');
    expect(text(files['data.yaml'])).toContain('  0: "Cube"');
    expect(text(files['segment/data.yaml'])).toContain('train: images/train');
    expect(text(files[`segment/labels/${folder}/${frame.id}.txt`])).toBe(
      '0 0.25 0 0.75 0 0.75 0.6666666666666666 0.25 0.6666666666666666\n',
    );
    expect(text(files['pose/data.yaml'])).toContain('kpt_shape: [1, 3]');
    expect(text(files[`pose/labels/${folder}/${frame.id}.txt`])).toBe(
      '0 0.5 0.3333333333333333 0.5 0.6666666666666666 0.5 0.3333333333333333 2\n',
    );
    expect(files[`images/${folder}/${frame.id}.jpg`]).toEqual(frame.image);
    expect(importYolo(files)).toEqual(set);
    expect(exportYolo(set)).toEqual(files);
  });

  it('rejects missing or modified exported images instead of accepting stale metadata', () => {
    const set = visionFixture();
    const files = exportCoco(set);
    const path = `images/train/${set.frames[0].id}.jpg`;

    expect(importCoco({ ...files, [path]: new Uint8Array([99]) })).toBeNull();
    delete files[path];
    expect(importCoco(files)).toBeNull();
  });

  it('rejects modified native COCO boxes and YOLO classes', () => {
    const set = visionFixture();
    const coco = exportCoco(set);
    const annotations = JSON.parse(text(coco['annotations/instances_train.json']));

    annotations.annotations[0].bbox[0] = 0;
    coco['annotations/instances_train.json'] = new TextEncoder().encode(JSON.stringify(annotations));
    expect(importCoco(coco)).toBeNull();

    const yolo = exportYolo(set);

    yolo[`labels/train/${set.frames[0].id}.txt`] = new TextEncoder().encode(
      '9 0.5 0.3333333333333333 0.5 0.6666666666666666\n',
    );
    expect(importYolo(yolo)).toBeNull();
  });

  it('writes all three disjoint splits when enough frames are available', () => {
    const set = visionFixture(10);
    const files = exportCoco(set);
    const groups = ['train', 'val', 'test'].map(
      (split) => JSON.parse(text(files[`annotations/instances_${split}.json`])).images,
    );

    expect(groups.map((g) => g.length)).toEqual([8, 1, 1]);
    expect(new Set(groups.flat().map((image: { id: number }) => image.id)).size).toBe(10);
    expect(importCoco(files)).toEqual(set);
  });

  it('merges frame sets with colliding class ids and preserves both class meanings', () => {
    const first = visionFixture();
    const second = { ...visionFixture(), name: 'Spheres', classes: [{ id: 7, name: 'Sphere', kind: 'sphere' }] };
    const merged = mergeFrameSets([first, second], 9);

    expect(merged.classes.map((c) => c.name).sort()).toEqual(['Cube', 'Sphere']);
    expect(merged.frames).toHaveLength(2);
    expect(merged.frames.map((f) => merged.classes.find((c) => c.id === f.annotations[0].classId)?.name)).toEqual([
      'Cube',
      'Sphere',
    ]);
    expect(merged.id).toBe(hashFrameSet(merged));
    expect(importCoco(exportCoco(merged))).toEqual(merged);
    expect(importYolo(exportYolo(merged))).toEqual(merged);
    expect(first.frames[0].annotations[0].classId).toBe(7);
  });
});
