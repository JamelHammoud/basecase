import { afterEach, describe, expect, it, vi } from 'vitest';
import { annotationFromInstances, decodeMask, encodeMask, maskPolygons } from './imageMasks';
import { frameHash, frameSetHash, frameSetManifestHash, validateFrameSet, type FrameSet } from './frameSet';
import { exportCoco, importCoco } from './cocoExport';
import { exportYolo, importYolo } from './yoloExport';
import { imageSplit } from './imageSplit';
import { splitOf } from '../datasets/datasetSplit';

afterEach(() => vi.restoreAllMocks());

export function fixture(): FrameSet {
  const width = 5;
  const height = 4;
  const instanceIds = new Uint32Array([0, 7, 7, 7, 0, 0, 7, 0, 7, 0, 0, 7, 7, 7, 0, 0, 0, 0, 0, 7]);
  const annotation = annotationFromInstances({
    width,
    height,
    instanceIds,
    instance: 'block',
    instanceId: 7,
    classId: 4,
    keypoints: [{ name: 'center', x: 2.5, y: 1.5, visible: false }],
  });

  if (!annotation) throw new Error('Fixture mask is empty.');

  return {
    version: 1,
    id: 'frames-1',
    name: 'Blocks',
    caseId: 'case-1',
    sceneId: 'scene-1',
    seed: 42,
    classes: [{ id: 4, name: 'Block', keypoints: ['center'] }],
    createdAt: '2026-11-14T00:00:00Z',
    frames: Array.from({ length: 25 }, (_, i) => ({
      id: `frame-${i}`,
      seed: i,
      camera: 'overview',
      width,
      height,
      jpeg: new Uint8Array([255, 216, i, 255, 217]),
      depth: Float32Array.from(instanceIds, (v) => (v ? 250.125 : 0)),
      annotations: [structuredClone(annotation)],
    })),
  };
}

const area = (polygon: number[]) =>
  polygon.reduce((sum, x, i) => {
    if (i % 2) return sum;

    const j = (i + 2) % polygon.length;

    return sum + x * polygon[j + 1] - polygon[j] * polygon[i + 1];
  }, 0) / 2;

describe('image labels', () => {
  it('encodes column-major COCO RLE from row-major pixels and clips boxes to visible pixels', () => {
    const mask = Uint8Array.from([0, 1, 0, 1, 1, 0]);
    const encoded = encodeMask(mask, 3, 2);

    expect(encoded).toEqual({ size: [2, 3], counts: [1, 3, 2] });
    expect(decodeMask(encoded)).toEqual(mask);
    expect(fixture().frames[0].annotations[0].box).toEqual([1, 0, 4, 4]);
    expect(
      annotationFromInstances({
        instanceIds: new Uint32Array(6),
        width: 3,
        height: 2,
        instance: 'gone',
        instanceId: 7,
        classId: 4,
      }),
    ).toBeNull();
  });

  it('preserves holes and disconnected diagonal islands with oriented boundary rings', () => {
    const rings = fixture().frames[0].annotations[0].polygons;

    expect(rings).toHaveLength(3);
    expect(rings.map(area).sort((a, b) => a - b)).toEqual([-1, 1, 9]);
    expect(maskPolygons(new Uint8Array(4), 2, 2)).toEqual([]);
  });

  it('rejects inconsistent masks, boxes, classes, keypoints, paths, depth and dimensions', () => {
    expect(() => validateFrameSet(fixture())).not.toThrow();

    const cases: Array<(set: FrameSet) => void> = [
      (set) => {
        set.id = '../escape';
      },
      (set) => {
        set.frames[0].width = 0;
      },
      (set) => {
        set.frames[0].depth[0] = NaN;
      },
      (set) => {
        set.frames[0].annotations[0].box[0] = 0;
      },
      (set) => {
        set.frames[0].annotations[0].mask.counts = [20];
      },
      (set) => {
        set.frames[0].annotations[0].classId = 99;
      },
      (set) => {
        set.frames[0].annotations[0].keypoints[0].name = 'missing';
      },
      (set) => {
        set.frames[0].annotations[0].polygons = [[0, 0, 2, 0, 0, 2]];
      },
    ];

    for (const mutate of cases) {
      const set = fixture();

      mutate(set);
      expect(() => validateFrameSet(set)).toThrow();
    }
  });

  it('matches streaming hashes and ignores display metadata and generated ids', async () => {
    const set = fixture();
    const hash = await frameSetHash(set);
    const hashes = await Promise.all(set.frames.map(frameHash));

    expect(await frameSetManifestHash(set, hashes)).toBe(hash);
    set.id = 'another-id';
    set.name = 'Renamed';
    set.createdAt = 'later';
    set.frames[0].id = 'another-frame-id';
    expect(await frameSetHash(set)).toBe(hash);
  });

  it('keeps finite off-screen keypoints as unlabeled COCO slots', () => {
    const set = fixture();
    const point = set.frames[0].annotations[0].keypoints[0];

    point.x = -20;
    expect(() => validateFrameSet(set)).not.toThrow();

    const files = exportCoco(set);
    const rows = Object.keys(files)
      .filter((path) => path.startsWith('annotations/'))
      .flatMap((path) => JSON.parse(new TextDecoder().decode(files[path])).annotations);

    expect(rows.find((row) => row.keypoints[2] === 0)).toMatchObject({ keypoints: [0, 0, 0], num_keypoints: 0 });
    point.visible = true;
    expect(() => validateFrameSet(set)).toThrow();
  });

  it('hashes RGB bytes, depth bytes, classes, seeds and labels deterministically', async () => {
    const set = fixture();
    const hash = await frameSetHash(set);

    expect(await frameSetHash(fixture())).toBe(hash);

    for (const mutate of [
      (s: FrameSet) => {
        s.frames[0].jpeg[2]++;
      },
      (s: FrameSet) => {
        s.frames[0].depth[1]++;
      },
      (s: FrameSet) => {
        s.frames[0].annotations[0].keypoints[0].visible = true;
      },
      (s: FrameSet) => {
        s.seed++;
      },
      (s: FrameSet) => {
        s.classes[0].name = 'Cube';
      },
    ]) {
      const changed = fixture();

      mutate(changed);
      expect(await frameSetHash(changed)).not.toBe(hash);
    }
  });
});

describe('image dataset hashing', () => {
  it('bounds concurrent hash buffer copies while preserving the complete set identity', async () => {
    const set = fixture();
    const expected = await frameSetManifestHash(set, await Promise.all(set.frames.map(frameHash)));
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let pending = 0;
    let peak = 0;

    vi.spyOn(crypto.subtle, 'digest').mockImplementation((algorithm, data) => {
      pending++;
      peak = Math.max(peak, pending);

      return digest(algorithm, data).finally(() => pending--);
    });

    expect(await frameSetHash(set)).toBe(expected);
    expect(peak).toBe(1);
  });
});

describe('image dataset export', () => {
  it('reuses the dataset split and subdivides the held-out ids with the same rule', () => {
    const set = fixture();
    const ids = set.frames.map((f) => f.id);
    const first = splitOf(ids, set.seed);
    const second = splitOf(first.validation, set.seed);
    const split = imageSplit(set);

    expect(split.train).toEqual(first.train);
    expect(split.validation).toEqual(second.train);
    expect(split.test).toEqual(second.validation);
    expect(imageSplit({ ...set, frames: [...set.frames].reverse() })).toEqual(split);
    expect(new Set([...split.train, ...split.validation, ...split.test]).size).toBe(25);
  });

  it.each([
    ['COCO', exportCoco, importCoco],
    ['YOLO', exportYolo, importYolo],
  ] as const)('round-trips %s masks, holes, hidden keypoints, depth and original bytes', async (_, write, read) => {
    const set = fixture();
    const files = write(set);
    const restored = read(files);

    expect(restored).toEqual(set);
    expect(await frameSetHash(restored)).toBe(await frameSetHash(set));
    expect(write(fixture())).toEqual(files);

    const path = Object.keys(files).find((p) => p.endsWith('.jpg'))!;

    files[path][2]++;
    expect(() => read(files)).toThrow();
  });

  it('writes COCO RLE, visible area and category-ordered keypoints in split JSON', () => {
    const files = exportCoco(fixture());
    const json = JSON.parse(new TextDecoder().decode(files['annotations/instances_train.json']));

    expect(json.annotations[0]).toMatchObject({
      category_id: 4,
      bbox: [1, 0, 4, 4],
      area: 9,
      iscrowd: 0,
      keypoints: [2.5, 1.5, 1],
      num_keypoints: 1,
    });
    expect(json.annotations[0].segmentation).toEqual(fixture().frames[0].annotations[0].mask);
    expect(json.categories[0].keypoints).toEqual(['center']);
  });

  it('writes Ultralytics detection layouts with dense class ids and normalized center boxes', () => {
    const files = exportYolo(fixture());
    const path = Object.keys(files).find((p) => p.startsWith('labels/train/'))!;

    expect(new TextDecoder().decode(files[path])).toBe('0 0.6 0.5 0.8 1\n');
    expect(new TextDecoder().decode(files['data.yaml'])).toContain('names: ["Block"]');

    const changed = { ...files, [path]: new TextEncoder().encode('0 0 0 0 0\n') };

    expect(() => importYolo(changed)).toThrow();
  });
});

describe('imported image provenance', () => {
  it('includes imported provenance in image identity while preserving unmarked hashes', async () => {
    const set = fixture();
    const frame = set.frames[0];
    const hash = await frameHash(frame);
    const setHash = await frameSetHash(set);

    expect(await frameHash({ ...frame, source: undefined })).toBe(hash);
    frame.source = 'import';
    expect(() => validateFrameSet(set)).not.toThrow();
    expect(await frameHash(frame)).not.toBe(hash);
    expect(await frameSetHash(set)).not.toBe(setHash);
  });

  it.each(['generated', 'file', null, 7])('refuses unsupported image provenance %s', (source) => {
    const set = fixture();

    expect(() => validateFrameSet({ ...set, frames: [{ ...set.frames[0], source }] })).toThrow('image dataset format');
  });
});
