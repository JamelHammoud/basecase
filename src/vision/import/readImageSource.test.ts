import { parquetWriteBuffer } from 'hyparquet-writer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceFolder } from '../../datasets/import/types';
import { validateFrameSet } from '../frameSet';
import { decodeMask } from '../imageMasks';
import { jsonBytes } from '../imageBytes';
import { exportCoco } from '../cocoExport';
import { exportYolo } from '../yoloExport';
import { imagePackage } from '../imagePackage';
import { decodeSourceImage } from './imageDecode';
import { sourceFiles } from './sourceFiles';
import { imageSourceKind } from './imageSourceKind';
import { readImageSource } from './readImageSource';

const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 4, 0, 4, 1, 1, 17, 0, 255, 217]);
const text = (value: string) => new TextEncoder().encode(value);
const folder = (files: Record<string, Uint8Array>): SourceFolder => ({
  name: 'Fruit',
  files: Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length, read: async () => bytes })),
});
const coco = (annotations: unknown[], image = 'apple.jpg') => ({
  images: [{ id: 1, file_name: image, width: 4, height: 4 }],
  categories: [{ id: 2, name: 'apple', keypoints: ['stem'] }],
  annotations: annotations.map((a) => ({ image_id: 1, category_id: 2, ...Object(a) })),
});

afterEach(() => vi.unstubAllGlobals());

describe('image dataset source readers', () => {
  it('identifies image layouts without claiming robot XML or LeRobot parquet', () => {
    expect(imageSourceKind(['train/_annotations.coco.json', 'train/apple.jpg'])).toBe('coco');
    expect(imageSourceKind(['data.yaml', 'images/a.jpg'])).toBe('yolo');
    expect(imageSourceKind(['Annotations/a.xml', 'JPEGImages/a.jpg'])).toBe('voc');
    expect(imageSourceKind(['data/train-00000-of-00001.parquet'])).toBe('image-parquet');
    expect(imageSourceKind(['robot.xml'])).toBeNull();
    expect(imageSourceKind(['meta/info.json', 'coco/basecase/frames.json'])).toBe('coco');
    expect(imageSourceKind(['meta/info.json', 'frames.json'])).toBeNull();
    expect(imageSourceKind(['meta/info.json', 'data/chunk-000/file-000.parquet'])).toBeNull();
  });

  it('reads COCO boxes, polygons, both RLE forms and named keypoints', async () => {
    const labels = [
      { id: 1, bbox: [1, 1, 2, 2], keypoints: [2, 1, 2] },
      { id: 2, segmentation: [[1, 1, 3, 1, 3, 3, 1, 3]] },
      { id: 3, segmentation: { size: [4, 4], counts: [5, 2, 2, 2, 5] } },
      { id: 4, segmentation: { size: [4, 4], counts: '52203' } },
    ];
    const set = await readImageSource(
      folder({ 'train/_annotations.coco.json': jsonBytes(coco(labels)), 'train/apple.jpg': jpeg }),
    );

    expect(set?.classes).toEqual([{ id: 2, name: 'apple', keypoints: ['stem'] }]);
    expect(set?.frames[0].split).toBe('train');
    expect(set?.frames[0].annotations.map((a) => a.box)).toEqual(Array.from({ length: 4 }, () => [1, 1, 2, 2]));
    expect(set?.frames[0].annotations[0].keypoints).toEqual([{ name: 'stem', x: 2, y: 1, visible: true }]);
    expect(decodeMask(set!.frames[0].annotations[3].mask)).toEqual(decodeMask(set!.frames[0].annotations[2].mask));
    validateFrameSet(set);
  });

  it.each([
    ['0 0.5 0.5 0.5 0.5', ''],
    ['0 0.25 0.25 0.75 0.25 0.75 0.75 0.25 0.75', 'task: segment\n'],
    ['0 0.5 0.5 0.5 0.5 0.5 0.25 2', 'kpt_shape: [1, 3]\n'],
  ])('reads YOLO detection, segmentation and pose: %s', async (label, extra) => {
    const files = {
      'data.yaml': text(`train: images/train\nval: images/val\nnames:\n  0: apple\n${extra}`),
      'images/val/a.jpg': jpeg,
      'labels/val/a.txt': text(label),
    };
    const set = await readImageSource(folder(files));

    expect(set?.frames[0].split).toBe('validation');
    expect(set?.frames[0].annotations[0].box).toEqual([1, 1, 2, 2]);
    validateFrameSet(set);
  });

  it('reads VOC one-based inclusive boxes and explicit test membership', async () => {
    const xml =
      '<annotation verified="yes"><filename>a.jpg</filename><size><width>4</width><height>4</height></size><object><name>apple</name><bndbox><xmin>2</xmin><ymin>2</ymin><xmax>3</xmax><ymax>3</ymax></bndbox></object></annotation>';
    const set = await readImageSource(
      folder({ 'Annotations/a.xml': text(xml), 'JPEGImages/a.jpg': jpeg, 'ImageSets/Main/test.txt': text('a\n') }),
    );

    expect(set?.frames[0].split).toBe('test');
    expect(set?.frames[0].annotations[0].box).toEqual([1, 1, 2, 2]);
    validateFrameSet(set);
  });

  it('reads Hub parquet images and objects with category names from dataset metadata', async () => {
    const bytes = new Uint8Array(
      parquetWriteBuffer({
        columnData: [
          { name: 'image', type: 'BYTE_ARRAY', data: [jpeg] },
          { name: 'objects', type: 'JSON', data: [{ bbox: [[1, 1, 2, 2]], category: [0] }] },
        ],
      }),
    );
    const info = { features: { objects: { feature: { category: { names: ['apple'] } } } } };
    const set = await readImageSource(
      folder({ 'data/validation-00000-of-00001.parquet': bytes, 'dataset_info.json': jsonBytes(info) }),
    );

    expect(set?.classes[0].name).toBe('apple');
    expect(set?.frames[0].split).toBe('validation');
    expect(set?.frames[0].annotations[0].box).toEqual([1, 1, 2, 2]);
    validateFrameSet(set);
  });

  it('uses stable content identities and deduplicates repeated images', async () => {
    const a = coco([{ bbox: [1, 1, 2, 2] }]);
    const files = { 'train/_annotations.coco.json': jsonBytes(a), 'train/apple.jpg': jpeg, 'train/copy.jpg': jpeg };
    const first = await readImageSource(folder(files));
    const second = await readImageSource(folder(Object.fromEntries(Object.entries(files).reverse())));

    expect(second?.id).toBe(first?.id);
    expect(second?.frames.map((f) => f.id)).toEqual(first?.frames.map((f) => f.id));
  });

  it.each([
    coco([{ bbox: [1, 1, 2, 2] }], '../outside.jpg'),
    coco([{ segmentation: [[1, 1, 2, 2, 'NaN', 3]] }]),
    coco([{ segmentation: { size: [4, 4], counts: 'oooooooooooooooooooo' } }]),
    coco(Array.from({ length: 10_001 }, () => ({ bbox: [1, 1, 2, 2] }))),
  ])('refuses hostile COCO geometry and paths', async (value) => {
    await expect(
      readImageSource(folder({ '_annotations.coco.json': jsonBytes(value), 'apple.jpg': jpeg })),
    ).rejects.toThrow();
  });

  it.each(['data.yaml', '_annotations.coco.json'])('refuses oversized %s before reading', async (filename) => {
    const bytes = filename.endsWith('.json') ? jsonBytes(coco([])) : text('names: [apple]');
    const source = folder({ [filename]: bytes });

    source.files[0].size = 100_000_000;
    source.files[0].read = async () => {
      throw new Error('read oversized file');
    };
    await expect(readImageSource(source)).rejects.toThrow(/size limit/);
  });
});

describe('image package fidelity and safety', () => {
  it('retains COCO keypoint visibility through export', async () => {
    const metadata = coco([{ bbox: [1, 1, 2, 2], keypoints: [0, 0, 0, 1, 1, 1, 2, 2, 2] }]);

    metadata.categories[0].keypoints = ['missing', 'hidden', 'visible'];

    const set = (await readImageSource(folder({ '_annotations.coco.json': jsonBytes(metadata), 'apple.jpg': jpeg })))!;
    const exported = exportCoco(set);
    const labels = JSON.parse(new TextDecoder().decode(exported['annotations/instances_train.json']));

    expect(labels.annotations[0].keypoints).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(set.frames[0].annotations[0].keypoints.map((point) => point.name)).toEqual(['hidden', 'visible']);
  });

  it('accepts differing category order across COCO splits', async () => {
    const a = coco([{ bbox: [1, 1, 2, 2] }]);
    const b = structuredClone(a);

    a.categories.push({ id: 3, name: 'pear', keypoints: [] });
    b.categories.unshift({ id: 3, name: 'pear', keypoints: [] });

    const set = await readImageSource(
      folder({
        'train/_annotations.coco.json': jsonBytes(a),
        'train/apple.jpg': jpeg,
        'valid/_annotations.coco.json': jsonBytes(b),
        'valid/apple.jpg': jpeg,
      }),
    );

    expect(set?.classes.map((category) => category.id)).toEqual([2, 3]);
    expect(set?.frames).toHaveLength(2);
  });

  it('round-trips canonical packages without losing depth, IDs or labels', async () => {
    const set = (await readImageSource(
      folder({ '_annotations.coco.json': jsonBytes(coco([{ bbox: [1, 1, 2, 2] }])), 'apple.jpg': jpeg }),
    ))!;

    set.frames[0].depth.fill(123.5);

    const files = {
      ...Object.fromEntries(Object.entries(exportCoco(set)).map(([path, value]) => [`coco/${path}`, value])),
      ...Object.fromEntries(Object.entries(exportYolo(set)).map(([path, value]) => [`yolo/${path}`, value])),
    };

    expect(await readImageSource(folder(files))).toEqual(set);
    expect(await readImageSource(folder(imagePackage(set)))).toEqual(set);
    expect(await readImageSource(folder({ 'meta/info.json': jsonBytes({}), ...files }))).toEqual(set);
    expect(
      await readImageSource(
        folder({ 'meta/info.json': jsonBytes({}), ...imagePackage(set), 'data/ignored.parquet': new Uint8Array([1]) }),
      ),
    ).toEqual(set);

    files['coco/annotations/instances_train.json'] = jsonBytes({});
    await expect(readImageSource(folder(files))).rejects.toThrow();
  });

  it('accepts a JPEG with a restart interval segment', async () => {
    const restartJpeg = new Uint8Array([255, 216, 255, 221, 0, 4, 0, 1, ...jpeg.slice(2)]);
    const set = await readImageSource(
      folder({ '_annotations.coco.json': jsonBytes(coco([])), 'apple.jpg': restartJpeg }),
    );

    expect(set?.frames[0].width).toBe(4);
  });

  it('caps aggregate decoded pixels before allocating image depth', async () => {
    const large = jpeg.slice();

    large[7] = 16;
    large[8] = 0;
    large[9] = 16;
    large[10] = 0;

    const files = sourceFiles(folder({}));

    await decodeSourceImage(large, files);
    await decodeSourceImage(large, files);
    await decodeSourceImage(large, files);
    await expect(decodeSourceImage(large, files)).rejects.toThrow(/size limit/);
  });

  it('caps declared source bytes before reading a file', async () => {
    const source = folder({ 'data.yaml': text('names: [apple]'), 'images/a.jpg': jpeg });

    source.files.forEach((file) => {
      file.size = 400_000_000;
      file.read = async () => {
        throw new Error('read source');
      };
    });
    await expect(readImageSource(source)).rejects.toThrow('Check the image dataset format.');
  });

  it('normalizes PNG in an offscreen canvas and releases its decoded bitmap', async () => {
    const png = new Uint8Array(33);

    png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    new DataView(png.buffer).setUint32(16, 4);
    new DataView(png.buffer).setUint32(20, 4);

    const close = vi.fn();
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const convertToBlob = vi.fn(async () => new Blob([jpeg], { type: 'image/jpeg' }));

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4, close })),
    );
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return { drawImage, fillRect };
        }
        convertToBlob = convertToBlob;
      },
    );

    const set = await readImageSource(folder({ '_annotations.coco.json': jsonBytes(coco([])), 'apple.jpg': png }));

    expect(set?.frames[0].jpeg).toEqual(jpeg);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(fillRect).toHaveBeenCalledWith(0, 0, 4, 4);
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.95 });
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(['../outside.jpg', '/outside.jpg', 'C:/outside.jpg', 'images\\outside.jpg', '%2e%2e/outside.jpg'])(
    'refuses hostile source path %s',
    async (path) => {
      await expect(readImageSource(folder({ 'data.yaml': text('names: [apple]'), [path]: jpeg }))).rejects.toThrow();
    },
  );

  it('leaves parquet without image objects to another importer', async () => {
    const bytes = new Uint8Array(
      parquetWriteBuffer({ columnData: [{ name: 'text', type: 'STRING', data: ['hello'] }] }),
    );

    expect(await readImageSource(folder({ 'data/train.parquet': bytes }))).toBeNull();
  });
});
