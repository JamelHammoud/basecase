import { afterAll, beforeAll, expect, it } from 'vitest';
import type { TrainingBenchmarkResult } from '../src/vision/renderAcceptanceBench';
import { openApp, type App } from './harness';

let app: App;

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

it('matches visible bounds for seeded block placements within one pixel', async () => {
  const result = await app.page.evaluate(() =>
    (
      window as unknown as {
        __studio: { trainingLabelBenchmark: (frames: number) => Promise<TrainingBenchmarkResult> };
      }
    ).__studio.trainingLabelBenchmark(5),
  );

  expect(result.frames).toBe(5);
  expect([result.width, result.height]).toEqual([640, 480]);
  expect(result.measured).toHaveLength(5);

  for (const { position, bounds } of result.measured) {
    const corners = [-100, 100].flatMap((dx) =>
      [-50, 50].flatMap((dy) =>
        [-50, 50].map((dz) => [
          320 + ((position[0] + dx) * 320) / (1000 - position[2] - dz),
          240 - ((position[1] + dy - 150) * 320) / (1000 - position[2] - dz),
        ]),
      ),
    );
    const expected = [
      Math.min(...corners.map(([x]) => x)),
      Math.min(...corners.map(([, y]) => y)),
      Math.max(...corners.map(([x]) => x)),
      Math.max(...corners.map(([, y]) => y)),
    ];

    expect(bounds, JSON.stringify(position)).not.toBeNull();

    for (const [edge, value] of expected.entries()) expect(Math.abs(bounds![edge] - value)).toBeLessThanOrEqual(1);
  }

  expect(app.errors).toEqual([]);
});
