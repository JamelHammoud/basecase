import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TrainingAcceptanceResult } from '../src/vision/renderAcceptance';
import { openApp, type App } from './harness';

let app: App;

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

const fixture = (kind: 'geometry' | 'fisheye' | 'keypoints' | 'repeatability') =>
  app.page.evaluate(
    (name) =>
      (
        window as unknown as {
          __studio: { trainingLabelFixture: (value: typeof name) => Promise<TrainingAcceptanceResult> };
        }
      ).__studio.trainingLabelFixture(name),
    kind,
  );

function expectBounds(actual: number[] | null, expected: number[]): void {
  expect(actual).not.toBeNull();

  for (const [index, edge] of expected.entries()) expect(Math.abs(actual![index] - edge)).toBeLessThanOrEqual(1);
}

describe('Rendered training labels', () => {
  it('matches pinhole surface bounds and radial depth, and removes hidden pixels from labels', async () => {
    const result = await fixture('geometry');
    const focal = 320;
    const left = 320 - (100 * focal) / 950;
    const top = 240 - (50 * focal) / 950;

    expectBounds(result.bounds?.target ?? null, [left, top, 640 - left, 480 - top]);
    expectBounds(result.bounds?.partial ?? null, [320, top, 640 - left, 480 - top]);
    expect(result.bounds?.hidden).toBeNull();
    expect(result.depthSamples!.length).toBeGreaterThan(2000);

    for (const [x, y, distance] of result.depthSamples!) {
      const expected = 950 * Math.hypot((x + 0.5 - 320) / focal, (240 - y - 0.5) / focal, 1);

      expect(Math.abs(distance - expected)).toBeLessThanOrEqual(5);
    }

    expect(result.hiddenAnnotations).toBe(0);
    expect(app.errors).toEqual([]);
  });

  it('uses the equidistant fisheye projection for the rendered instance and named point', async () => {
    const result = await fixture('fisheye');
    const corners = [200, 400].flatMap((x) =>
      [-50, 50].flatMap((y) =>
        [950, 1050].map((z) => {
          const side = Math.hypot(x, y);
          const scale = (640 * Math.atan2(side, z)) / (Math.PI * side);

          return [320 + x * scale, 240 - y * scale];
        }),
      ),
    );
    const expected = [
      Math.min(...corners.map(([x]) => x)),
      Math.min(...corners.map(([, y]) => y)),
      Math.max(...corners.map(([x]) => x)),
      Math.max(...corners.map(([, y]) => y)),
    ];

    expectBounds(result.bounds?.target ?? null, expected);
    expect(result.points![0].x).toBeCloseTo(320 + (640 * Math.atan2(300, 950)) / Math.PI, 5);
    expect(result.points![0].y).toBeCloseTo(240, 5);
    expect(result.points![0].visible).toBe(true);
    expect(app.errors).toEqual([]);
  });

  it('projects the mug handle, person landmarks and hexapod leg tips from an overhead camera', async () => {
    const result = await fixture('keypoints');
    const expected: Record<string, [number, number]> = {
      handle: [164.8, 240],
      head: [320, 192],
      left_hand: [294.4, 224],
      right_hand: [345.6, 224],
      left_foot: [307.2, 288],
      right_foot: [332.8, 288],
      front_left_tip: [454.4, 208],
      front_right_tip: [505.6, 208],
      middle_left_tip: [454.4, 240],
      middle_right_tip: [505.6, 240],
      rear_left_tip: [454.4, 272],
      rear_right_tip: [505.6, 272],
    };

    expect(result.points).toHaveLength(Object.keys(expected).length);

    for (const point of result.points!) {
      expect(point.x, point.name).toBeCloseTo(expected[point.name][0], 4);
      expect(point.y, point.name).toBeCloseTo(expected[point.name][1], 4);
      expect(point.visible, point.name).toBe(true);
    }

    expect(result.annotatedInstances).toEqual(expect.arrayContaining(['mug', 'person', 'robot_front_left_tip']));
    expect(app.errors).toEqual([]);
  });

  it('repeats image, depth, masks and keypoints byte for byte with the same seed after another frame', async () => {
    const result = await fixture('repeatability');

    expect(result.identical).toEqual({ jpeg: true, instances: true, depth: true, keypoints: true });
    expect(result.differentSeedChangesImage).toBe(true);
    expect(app.errors).toEqual([]);
  });
});
