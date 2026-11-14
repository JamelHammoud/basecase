import { beforeAll, describe, expect, it } from 'vitest';

import { TAG36H11_COUNT } from './tag36h11';
import { loadTagDetector, type TagDetection, type TagDetector } from './tagDetector';
import { type GrayImage, type ImagePoint, renderTags, squareTag, type TagPlacement, tiltedTag } from './tagImages';

let detector: TagDetector;

beforeAll(async () => {
  detector = await loadTagDetector();
});

const run = (image: GrayImage): TagDetection[] => detector.detect(image.gray, image.width, image.height);

function cornerErrors(found: TagDetection, truth: TagPlacement): number[] {
  return truth.corners.map(([x, y], k) => Math.hypot(found.corners[k][0] - x, found.corners[k][1] - y));
}

function rms(errors: number[]): number {
  return Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length);
}

function single(image: GrayImage, id: number): TagDetection {
  const found = run(image).filter((d) => d.id === id);

  expect(found).toHaveLength(1);

  return found[0];
}

const PRINTED = { black: 40, white: 210, noise: 3 };

describe('loadTagDetector', () => {
  it('decodes every 36h11 id', () => {
    const pitch = 60;
    const columns = 8;
    const perImage = columns * columns;

    for (let first = 0; first < TAG36H11_COUNT; first += perImage) {
      const ids = Array.from({ length: Math.min(perImage, TAG36H11_COUNT - first) }, (_, i) => first + i);
      const tags = ids.map((id, i): TagPlacement => {
        const centre: ImagePoint = [((i % columns) + 0.5) * pitch, (Math.floor(i / columns) + 0.5) * pitch];

        return squareTag(id, centre, 40);
      });
      const found = run(renderTags({ width: 480, height: 480 }, tags, { black: 30, white: 220 }));

      expect(found.map((d) => d.id).sort((a, b) => a - b)).toEqual(ids);
      expect(found.every((d) => d.hamming === 0)).toBe(true);
    }
  });

  it('puts the tag’s own top-left corner first at any rotation', () => {
    for (const degrees of [0, 90, 180, 270, 33, 127, -61, 200]) {
      const tag = squareTag(7, [320, 240], 120, degrees);
      const found = single(renderTags({ width: 640, height: 480 }, [tag], PRINTED), 7);

      expect(Math.max(...cornerErrors(found, tag))).toBeLessThan(0.5);
    }
  });

  it('finds a clean tag’s corners to sub-pixel accuracy', () => {
    const tag = squareTag(42, [330.3, 241.7], 200, 17);
    const found = single(renderTags({ width: 640, height: 480 }, [tag]), 42);

    expect(rms(cornerErrors(found, tag))).toBeLessThan(0.3);
  });

  it('decodes a tag seen at 55 degrees', () => {
    const tag = tiltedTag(311, [320, 240], 160, { tilt: 55, spin: 20 });
    const found = single(renderTags({ width: 640, height: 480 }, [tag], PRINTED), 311);

    expect(Math.max(...cornerErrors(found, tag))).toBeLessThan(0.5);
  });

  it('decodes a 45 pixel tag', () => {
    const tag = squareTag(586, [200.4, 150.6], 45, 12);
    const found = single(renderTags({ width: 400, height: 300 }, [tag], PRINTED), 586);

    expect(Math.max(...cornerErrors(found, tag))).toBeLessThan(0.5);
  });

  it('finds two tags in a 720p frame', () => {
    const tags = [squareTag(3, [400, 360], 90, 10), tiltedTag(250, [900, 380], 140, { tilt: 40, spin: -25 })];
    const found = run(renderTags({ width: 1280, height: 720 }, tags, PRINTED));

    expect(found.map((d) => d.id).sort((a, b) => a - b)).toEqual([3, 250]);
    tags.forEach((tag) => {
      const match = found.find((d) => d.id === tag.id);

      expect(match && Math.max(...cornerErrors(match, tag))).toBeLessThan(0.75);
    });
  });

  it('finds nothing in noise or a blank frame', () => {
    const size = { width: 1280, height: 720 };

    expect(run(renderTags(size, [], { white: 128, noise: 120, seed: 9 }))).toEqual([]);
    expect(run(renderTags({ width: 640, height: 480 }, [], { white: 128, noise: 120, seed: 4 }))).toEqual([]);
    expect(run(renderTags(size, []))).toEqual([]);
  });
});
