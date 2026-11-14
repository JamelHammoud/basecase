import { expect, it } from 'vitest';
import { imageClassPlan, imagePlan, imageSetName } from './makeImagesPlan';

const views = [
  { key: 'eye', label: 'Eye' },
  { key: 'outside', label: 'Outside' },
];

it('cycles the chosen cameras with a deterministic seed per image', () => {
  expect(imagePlan({ views, count: 4, seed: 10, cameras: ['outside', 'eye'] })).toEqual([
    { camera: 'outside', seed: 10 },
    { camera: 'eye', seed: 11 },
    { camera: 'outside', seed: 12 },
    { camera: 'eye', seed: 13 },
  ]);
});

it('refuses missing cameras, fractional counts and overflowing seeds', () => {
  expect(() => imagePlan({ views, count: 1, seed: 0, cameras: ['missing'] })).toThrow('missing');
  expect(() => imagePlan({ views, count: 0.5, seed: 0 })).toThrow();
  expect(() => imagePlan({ views, count: 2, seed: Number.MAX_SAFE_INTEGER })).toThrow();
  expect(() => imagePlan({ views, count: 10001, seed: 0 })).toThrow();
  expect(imagePlan({ views, count: 2, seed: 0xffffffff }).map((sample) => sample.seed)).toEqual([
    0xffffffff, 0x100000000,
  ]);
});

it('resolves camera names to the same view keys without duplicate camera slots', () => {
  expect(imagePlan({ views, count: 2, seed: 0, cameras: [' Eye ', 'eye'] })).toEqual([
    { camera: 'eye', seed: 0 },
    { camera: 'eye', seed: 1 },
  ]);
});

it('refuses missing classes before rendering and keeps names and kind selections consistent', () => {
  const classes = [
    { id: 1, name: 'Block', kind: 'box' },
    { id: 2, name: 'Mug', kind: 'mesh' },
  ];

  expect(imageClassPlan(classes, ['Block'])).toEqual([classes[0]]);
  expect(imageClassPlan(classes, ['box'])).toEqual([classes[0]]);
  expect(() => imageClassPlan(classes, ['Missing'])).toThrow('Missing');
});

it('distinguishes classes that share a name by their kind without changing name selections', () => {
  const classes = [
    { id: 1, name: 'Block', kind: 'link' },
    { id: 2, name: 'Block', kind: 'box' },
  ];

  expect(imageClassPlan(classes, ['box:Block'])).toEqual([classes[1]]);
  expect(imageClassPlan(classes, ['Block'])).toEqual(classes);
});

it('keeps frame-set names within the Dataset name limit even for long Case names', () => {
  expect(imageSetName('Pick Up a Block')).toBe('Pick Up a Block images');
  expect(imageSetName('x'.repeat(2000))).toHaveLength(200);
  expect(imageSetName('')).toBe('Scene images');
});
