import { describe, expect, it } from 'vitest';
import { requestHandler, type RequestContext } from './agentRequestHandlers';
import { trainingImageInput } from './trainingImageRequest';

describe('make_images payload', () => {
  it('keeps the selected Case, count, cameras, classes and reproducible seed', () => {
    expect(
      trainingImageInput({ case: 'Pick Up a Block', count: 20, cameras: ['scene'], classes: ['Block'], seed: 42 }),
    ).toEqual({ case: 'Pick Up a Block', count: 20, cameras: ['scene'], classes: ['Block'], seed: 42 });
  });

  it('refuses malformed counts, seeds and selection lists before rendering', () => {
    const bad = [
      {},
      { count: 0 },
      { count: -1 },
      { count: 1.5 },
      { count: 10001 },
      { count: Infinity },
      { count: '20' },
      { count: 20, seed: NaN },
      { count: 20, seed: -1 },
      { count: 20, cameras: [] },
      { count: 20, cameras: [3] },
      { count: 20, classes: [''] },
      { count: 20, classes: ['x'.repeat(4097)] },
      { count: 20, case: 3 },
    ];

    for (const payload of bad) expect(() => trainingImageInput(payload)).toThrow();
  });

  it('allows omitted selections and removes repeated names', () => {
    expect(trainingImageInput({ count: 20 })).toEqual({ count: 20 });
    expect(trainingImageInput({ count: 2, cameras: ['scene', 'scene'], classes: ['Block', 'Block'] })).toEqual({
      count: 2,
      cameras: ['scene'],
      classes: ['Block'],
    });
  });

  it('accepts every class in a full Case world together with the robot links', () => {
    const classes = Array.from({ length: 512 }, (_, index) => `Class ${index}`);

    expect(trainingImageInput({ count: 20, classes }).classes).toEqual(classes);
    expect(trainingImageInput({ count: 20, classes: ['x'.repeat(2000)] }).classes).toEqual(['x'.repeat(2000)]);
  });
});

describe('make_images dispatch', () => {
  it('forwards the validated selection to the shared generation action and returns its saved ids and counts', async () => {
    const calls: unknown[] = [];
    const result = {
      ok: true,
      id: 'frame-set',
      dataset: 'dataset-1',
      count: 20,
      classes: [{ id: 1, name: 'Block', count: 20 }],
    };
    const ctx = {
      trainingImages: {
        make: async (input: unknown) => {
          calls.push(input);

          return result;
        },
      },
    } as unknown as RequestContext;
    const handler = requestHandler('make_images')!;
    const payload = { case: 'Pick Up a Block', count: 20, cameras: ['scene'], classes: ['Block'], seed: 42 };

    expect(await handler(payload, ctx, 'make_images')).toEqual(result);
    expect(calls).toEqual([payload]);
  });

  it('refuses a malformed payload before calling the generator', () => {
    let called = false;
    const ctx = {
      trainingImages: {
        make: async () => {
          called = true;

          return { ok: false, problem: 'Unexpected call' };
        },
      },
    } as unknown as RequestContext;

    expect(() => requestHandler('make_images')!({ count: -1 }, ctx, 'make_images')).toThrow('Choose 1 to');
    expect(called).toBe(false);
  });
});
