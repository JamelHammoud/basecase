import { parquetWriteBuffer } from 'hyparquet-writer';
import { expect, it } from 'vitest';
import type { SourceFolder } from '../../datasets/import/types';
import { jsonBytes } from '../imageBytes';
import { readCoco } from './cocoRead';
import { readImageParquet } from './parquetRead';
import { readImageSource } from './readImageSource';
import { sourceFiles } from './sourceFiles';
import { readVoc } from './vocRead';

const jpeg = new Uint8Array([255, 216, 255, 192, 0, 11, 8, 0, 4, 0, 4, 1, 1, 17, 0, 255, 217]);
const folder = (files: Record<string, Uint8Array>): SourceFolder => ({
  name: 'Fruit',
  files: Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length, read: async () => bytes })),
});
const parquet = (objects: unknown[][], names: string[] = []) =>
  new Uint8Array(
    parquetWriteBuffer({
      columnData: [
        { name: 'image', type: 'BYTE_ARRAY', data: objects.map(() => jpeg) },
        { name: 'objects', type: 'JSON', data: objects },
      ],
      kvMetadata: names.length
        ? [{ key: 'huggingface', value: JSON.stringify({ info: { features: { objects: { category: { names } } } } }) }]
        : [],
    }),
  );
const object = (category: unknown) => ({ category, bbox: [1, 1, 2, 2] });

it('resolves sparse COCO ids and named keypoints across reordered split metadata', async () => {
  const categories = [
    { id: 0xffffffff, name: 'pear', keypoints: ['tip'] },
    { id: 0, name: 'apple', keypoints: ['stem'] },
  ];
  const ids = [0xffffffff, 0, 0xffffffff, 0];
  const metadata = (classes: typeof categories) =>
    jsonBytes({
      images: [{ id: 1, file_name: 'a.jpg', width: 4, height: 4 }],
      categories: classes,
      annotations: ids.map((category_id) => ({ image_id: 1, category_id, bbox: [1, 1, 2, 2], keypoints: [2, 1, 2] })),
    });
  const files = sourceFiles(
    folder({
      'train/instances.json': metadata(categories),
      'train/a.jpg': jpeg,
      'test/instances.json': metadata([...categories].reverse()),
      'test/a.jpg': jpeg,
    }),
  );
  const result = await readCoco(files);

  expect(result.classes).toEqual([...categories].reverse());
  expect(result.frames).toHaveLength(2);

  for (const frame of result.frames) {
    expect(frame.annotations.map((annotation) => annotation.classId)).toEqual(ids);
    expect(frame.annotations.map((annotation) => annotation.keypoints[0].name)).toEqual(['tip', 'stem', 'tip', 'stem']);
  }

  const manifest = JSON.parse(new TextDecoder().decode(metadata(categories)));

  manifest.annotations[0].category_id = 12;
  await expect(readImageSource(folder({ 'instances.json': jsonBytes(manifest), 'a.jpg': jpeg }))).rejects.toThrow(
    'Check the image dataset format.',
  );
});

it('retains VOC discovery order and reuses classes across sorted image files', async () => {
  const xml = (filename: string, labels: string[]) =>
    new TextEncoder().encode(
      `<annotation><filename>${filename}</filename><size><width>4</width><height>4</height></size>${labels
        .map(
          (label) =>
            `<object><name>${label}</name><bndbox><xmin>2</xmin><ymin>2</ymin><xmax>3</xmax><ymax>3</ymax></bndbox></object>`,
        )
        .join('')}</annotation>`,
    );
  const result = await readVoc(
    sourceFiles(
      folder({
        'Annotations/b.xml': xml('b.jpg', ['pear', 'orange', 'apple', 'orange']),
        'JPEGImages/b.jpg': jpeg,
        'Annotations/a.xml': xml('a.jpg', ['apple', 'pear', 'apple']),
        'JPEGImages/a.jpg': jpeg,
      }),
    ),
  );

  expect(result.classes).toEqual([
    { id: 0, name: 'apple' },
    { id: 1, name: 'pear' },
    { id: 2, name: 'orange' },
  ]);
  expect(result.frames.map((frame) => frame.annotations.map((annotation) => annotation.classId))).toEqual([
    [0, 1, 0],
    [1, 2, 0, 2],
  ]);
});

it('retains inferred Parquet names and sparse ids across rows and shards', async () => {
  const result = await readImageParquet(
    sourceFiles(
      folder({
        'data/a.parquet': parquet([
          [object('apple'), object(0xffffffff)],
          [object(0), object('apple')],
        ]),
        'data/b.parquet': parquet([[object(0xffffffff), object('class-4294967295'), object('pear'), object(2)]]),
      }),
    ),
  );

  expect(result?.classes).toEqual([
    { id: 0, name: 'apple' },
    { id: 0xffffffff, name: 'class-4294967295' },
    { id: 2, name: 'pear' },
  ]);
  expect(result?.frames.map((frame) => frame.annotations.map((annotation) => annotation.classId))).toEqual([
    [0, 0xffffffff],
    [0, 0],
    [0xffffffff, 0xffffffff, 2, 2],
  ]);
});

it('indexes Parquet footer classes before annotations, including metadata first appearing in a later shard', async () => {
  const result = await readImageParquet(
    sourceFiles(
      folder({
        'data/a.parquet': parquet([[]]),
        'data/b.parquet': parquet([[object(1), object('apple'), object(0)]], ['apple', 'pear']),
      }),
    ),
  );

  expect(result?.classes).toEqual([
    { id: 0, name: 'apple' },
    { id: 1, name: 'pear' },
  ]);
  expect(result?.frames[1].annotations.map((annotation) => annotation.classId)).toEqual([1, 0, 0]);
});
