import { parquetWriteBuffer } from 'hyparquet-writer';
import { describe, expect, it } from 'vitest';
import type { SourceFolder } from '../../datasets/import/types';
import { readImageSource } from './readImageSource';
import { IMAGE_LIMITS } from './sourceFiles';

const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 4, 0, 4, 1, 1, 17, 0, 255, 217]);
const text = (value: string) => new TextEncoder().encode(value);
const folder = (files: Record<string, Uint8Array>): SourceFolder => ({
  name: 'Fruit',
  files: Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length, read: async () => bytes })),
});
const voc = text(
  '<annotation><filename>a.jpg</filename><size><width>4</width><height>4</height></size><object><name>apple</name><bndbox><xmin>2</xmin><ymin>2</ymin><xmax>3</xmax><ymax>3</ymax></bndbox></object></annotation>',
);

describe('COCO source folders and bounds', () => {
  it('reads the official COCO split image folders and year suffixes', async () => {
    const manifest = text(
      JSON.stringify({ images: [{ id: 1, file_name: 'a.jpg', width: 4, height: 4 }], categories: [], annotations: [] }),
    );
    const set = await readImageSource(
      folder({
        'annotations/instances_val2017.json': manifest,
        'val2017/a.jpg': jpeg,
      }),
    );

    expect(set?.frames).toHaveLength(1);
    expect(set?.frames[0].split).toBe('validation');
  });

  it('refuses COCO frame counts over the dataset cap across manifests', async () => {
    const manifest = (count: number) =>
      text(
        JSON.stringify({
          images: Array.from({ length: count }, (_, id) => ({ id, file_name: 'a.jpg', width: 4, height: 4 })),
          categories: [],
          annotations: [],
        }),
      );
    const source = folder({
      'one/instances_train.json': manifest(IMAGE_LIMITS.frames),
      'one/a.jpg': jpeg,
      'two/instances_test.json': manifest(1),
      'two/a.jpg': jpeg,
    });
    let reads = 0;

    source.files[3].read = async () => {
      reads++;

      return jpeg;
    };
    await expect(readImageSource(source)).rejects.toThrow();
    expect(reads).toBe(0);
  });
});

describe('YOLO source selection', () => {
  it('imports only YOLO images selected by the declared split folders', async () => {
    const set = await readImageSource(
      folder({
        'data.yaml': text('names: [apple]\npath: fruit\ntrain: selected\n'),
        'fruit/selected/a.jpg': jpeg,
        'fruit/unused/b.jpg': jpeg,
        'preview.jpg': jpeg,
      }),
    );

    expect(set?.frames).toHaveLength(1);
    expect(set?.frames[0].split).toBe('train');
  });

  it('reads YOLO image lists with split membership independent of image folder names', async () => {
    const set = await readImageSource(
      folder({
        'data.yaml': text('names: [apple]\ntrain: lists/train.txt\nval: lists/val.txt\n'),
        'lists/train.txt': text('../images/a.jpg\n'),
        'lists/val.txt': text('../images/b.jpg\n'),
        'images/a.jpg': jpeg,
        'images/b.jpg': jpeg,
        'images/unused.jpg': jpeg,
      }),
    );

    expect(set?.frames.map((frame) => frame.split).sort()).toEqual(['train', 'validation']);
  });

  it('resolves YOLO split directories relative to a nested YAML file', async () => {
    const set = await readImageSource(
      folder({
        'config/data.yaml': text('names: [apple]\ntrain: ../train/images\nval: ../valid/images\n'),
        'train/images/a.jpg': jpeg,
        'valid/images/b.jpg': jpeg,
        'unused/a.jpg': jpeg,
      }),
    );

    expect(set?.frames.map((frame) => frame.split).sort()).toEqual(['train', 'validation']);
  });

  it('reads Roboflow YOLO split paths using the provided dataset root fallback', async () => {
    const set = await readImageSource(
      folder({
        'data.yaml': text('names: [apple]\ntrain: ../train/images\nval: ../valid/images\n'),
        'train/images/a.jpg': jpeg,
        'valid/images/b.jpg': jpeg,
        'unused/a.jpg': jpeg,
      }),
    );

    expect(set?.frames.map((frame) => frame.split).sort()).toEqual(['train', 'validation']);
  });

  it('refuses YOLO directory traversal beyond its one-level root fallback', async () => {
    await expect(
      readImageSource(
        folder({
          'data.yaml': text('names: [apple]\ntrain: ../../outside\n'),
          'outside/a.jpg': jpeg,
        }),
      ),
    ).rejects.toThrow();
  });

  it('finds YOLO labels beside the last images path segment', async () => {
    const set = await readImageSource(
      folder({
        'images/fruit/data.yaml': text('names: [apple]\ntrain: images\n'),
        'images/fruit/images/a.jpg': jpeg,
        'images/fruit/labels/a.txt': text('0 0.5 0.5 0.5 0.5'),
      }),
    );

    expect(set?.frames[0].annotations[0].box).toEqual([1, 1, 2, 2]);
  });

  it('refuses YOLO image lists that leave the dropped dataset', async () => {
    await expect(
      readImageSource(
        folder({
          'data.yaml': text('names: [apple]\ntrain: lists/train.txt\n'),
          'lists/train.txt': text('../../outside.jpg\n'),
          'outside.jpg': jpeg,
        }),
      ),
    ).rejects.toThrow();
  });

  it('retains every declared YOLO split when an image belongs to more than one', async () => {
    const set = await readImageSource(
      folder({
        'data.yaml': text('names: [apple]\ntrain: images\nval: images\n'),
        'images/a.jpg': jpeg,
      }),
    );

    expect(set?.frames.map((frame) => frame.split).sort()).toEqual(['train', 'validation']);
  });
});

describe('VOC and Parquet label fidelity', () => {
  it('keeps VOC split membership inside each dataset root', async () => {
    const set = await readImageSource(
      folder({
        'one/Annotations/a.xml': voc,
        'one/JPEGImages/a.jpg': jpeg,
        'one/ImageSets/Main/train.txt': text('a\n'),
        'train/two/Annotations/a.xml': voc,
        'train/two/JPEGImages/a.jpg': jpeg,
        'train/two/ImageSets/Main/test.txt': text('a\n'),
      }),
    );

    expect(set?.frames.map((frame) => frame.split).sort()).toEqual(['test', 'train']);
  });

  it.each([
    { bbox: [[1, 1, 2, 2]], category: [0], segmentation: [] },
    { bbox: [[1, 1, 2, 2]], category: [0], keypoints: [] },
  ])('refuses mismatched Parquet annotation columns', async (objects) => {
    const bytes = new Uint8Array(
      parquetWriteBuffer({
        columnData: [
          { name: 'image', type: 'BYTE_ARRAY', data: [jpeg] },
          { name: 'objects', type: 'JSON', data: [objects] },
        ],
      }),
    );

    await expect(readImageSource(folder({ 'data/train.parquet': bytes }))).rejects.toThrow();
  });
});

describe('inferred source class bounds', () => {
  it('stops VOC at the class cap before reading the next image', async () => {
    const objects = Array.from(
      { length: 1001 },
      (_, id) =>
        `<object><name>class-${id}</name><bndbox><xmin>2</xmin><ymin>2</ymin><xmax>3</xmax><ymax>3</ymax></bndbox></object>`,
    ).join('');
    const source = folder({
      'Annotations/a.xml': text(
        `<annotation><filename>a.jpg</filename><size><width>4</width><height>4</height></size>${objects}</annotation>`,
      ),
      'JPEGImages/a.jpg': jpeg,
      'Annotations/z.xml': voc,
      'JPEGImages/z.jpg': jpeg,
    });
    let reads = 0;

    source.files[3].read = async () => {
      reads++;

      return jpeg;
    };
    await expect(readImageSource(source)).rejects.toThrow();
    expect(reads).toBe(0);
  });

  it.each(['name', 'id'])('stops Parquet at the inferred class cap for %s labels', async (label) => {
    const objects = Array.from({ length: 1001 }, (_, id) => ({
      category: label === 'name' ? `class-${id}` : id,
      bbox: [1, 1, 2, 2],
    }));
    const parquet = new Uint8Array(
      parquetWriteBuffer({
        columnData: [
          { name: 'image', type: 'JSON', data: [{ path: 'a.jpg' }, { path: 'z.jpg' }] },
          { name: 'objects', type: 'JSON', data: [objects, []] },
        ],
      }),
    );
    const source = folder({ 'data/train.parquet': parquet, 'a.jpg': jpeg, 'z.jpg': jpeg });
    let reads = 0;

    source.files[2].read = async () => {
      reads++;

      return jpeg;
    };
    await expect(readImageSource(source)).rejects.toThrow();
    expect(reads).toBe(0);
  });
});
