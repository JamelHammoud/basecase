import { apply, fitHomography } from './homography';
import { TAG_CELLS, tagCells } from './tag36h11';

export type ImagePoint = [number, number];

export interface TagPlacement {
  id: number;
  corners: ImagePoint[];
}

export interface TagImageOptions {
  black?: number;
  white?: number;
  noise?: number;
  seed?: number;
  samples?: number;
}

export interface GrayImage {
  gray: Uint8Array;
  width: number;
  height: number;
}

type Mapper = (x: number, y: number) => ImagePoint;

const SQUARE_IN_CELLS: ImagePoint[] = [
  [1, 1],
  [9, 1],
  [9, 9],
  [1, 9],
];

function homography(from: ImagePoint[], to: ImagePoint[]): Mapper {
  const fit = fitHomography(from.map((p, k) => ({ from: p, to: to[k] })));

  if (!fit) throw new Error('Tag corners are degenerate');

  return (u, v) => apply(fit, [u, v]);
}

function random(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function outerBox(corners: ImagePoint[], width: number, height: number): [number, number, number, number] {
  const toImage = homography(SQUARE_IN_CELLS, corners);
  const outer = [toImage(0, 0), toImage(TAG_CELLS, 0), toImage(TAG_CELLS, TAG_CELLS), toImage(0, TAG_CELLS)];
  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);

  return [
    Math.max(0, Math.floor(Math.min(...xs))),
    Math.max(0, Math.floor(Math.min(...ys))),
    Math.min(width, Math.ceil(Math.max(...xs))),
    Math.min(height, Math.ceil(Math.max(...ys))),
  ];
}

function cellInk(cells: Uint8Array, u: number, v: number): number {
  if (u < 0 || v < 0 || u >= TAG_CELLS || v >= TAG_CELLS) return 0;

  return cells[Math.floor(v) * TAG_CELLS + Math.floor(u)];
}

function paintTag(image: Float32Array, width: number, tag: TagPlacement, samples: number): void {
  const height = image.length / width;
  const cells = tagCells(tag.id);
  const toCells = homography(tag.corners, SQUARE_IN_CELLS);
  const [x0, y0, x1, y1] = outerBox(tag.corners, width, height);

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let ink = 0;

      for (let k = 0; k < samples * samples; k++) {
        const [u, v] = toCells(x + ((k % samples) + 0.5) / samples, y + (Math.floor(k / samples) + 0.5) / samples);

        ink += cellInk(cells, u, v);
      }

      image[y * width + x] = Math.max(image[y * width + x], ink / (samples * samples));
    }
  }
}

export function renderTags(
  size: { width: number; height: number },
  tags: TagPlacement[],
  options: TagImageOptions = {},
): GrayImage {
  const { width, height } = size;
  const { black = 0, white = 255, noise = 0, seed = 1, samples = 3 } = options;
  const ink = new Float32Array(width * height);
  const next = random(seed);
  const gray = new Uint8Array(width * height);

  tags.forEach((tag) => paintTag(ink, width, tag, samples));
  ink.forEach((amount, i) => {
    const jitter = noise * (next() + next() + next() - 1.5) * 2;

    gray[i] = Math.round(Math.min(255, Math.max(0, white + (black - white) * amount + jitter)));
  });

  return { gray, width, height };
}

export function squareTag(id: number, centre: ImagePoint, size: number, degrees = 0): TagPlacement {
  const a = (degrees * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const local: ImagePoint[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];

  return {
    id,
    corners: local.map(([u, v]) => [
      centre[0] + (u * c - v * s) * (size / 2),
      centre[1] + (u * s + v * c) * (size / 2),
    ]),
  };
}

export function tiltedTag(
  id: number,
  centre: ImagePoint,
  size: number,
  view: { tilt: number; spin: number },
): TagPlacement {
  const focal = size * 4;
  const tilt = (view.tilt * Math.PI) / 180;
  const flat = squareTag(id, [0, 0], size, view.spin);

  return {
    id,
    corners: flat.corners.map(([x, y]) => {
      const z = focal + y * Math.sin(tilt);

      return [centre[0] + (focal * x) / z, centre[1] + (focal * y * Math.cos(tilt)) / z];
    }),
  };
}
