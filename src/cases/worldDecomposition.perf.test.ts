import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BoxGeometry } from 'three';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import type { WorldHull } from './worldDecomposition';

type Point = [number, number, number];

interface Measurement {
  elapsed: number;
  triangles: number;
  pieces: WorldHull[];
}

function box(at: Point, size: Point, segments: Point = [1, 1, 1]): BoxGeometry {
  return new BoxGeometry(...size, ...segments).translate(...at);
}

function kitchen() {
  const legs = [-700, 700].flatMap((x) => [700, 1700].map((z) => box([x, 350, z], [80, 700, 80])));
  const geometry = [
    box([0, -50, 0], [6000, 100, 6000], [198, 1, 249]),
    box([0, 750, 1200], [1600, 100, 1200], [12, 1, 17]),
    ...legs,
    box([-2500, 500, 0], [500, 1000, 4000]),
    box([2500, 1000, 0], [100, 2000, 6000]),
  ];
  const positions = new Float32Array(geometry.reduce((sum, item) => sum + item.attributes.position.array.length, 0));
  const indices = new Uint32Array(geometry.reduce((sum, item) => sum + item.index!.count, 0));
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const item of geometry) {
    const source = item.attributes.position.array;

    positions.set(source, vertexOffset * 3);

    for (const index of item.index!.array) indices[indexOffset++] = index + vertexOffset;

    vertexOffset += source.length / 3;
    item.dispose();
  }

  return { positions, indices };
}

async function workerCode(): Promise<string> {
  const entry = 'world-decomposition-perf';
  const module = `export { decomposeWorld } from ${JSON.stringify(fileURLToPath(new URL('./worldDecomposition.ts', import.meta.url)))};`;
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: entry,
        resolveId: (id) => (id === entry || id.endsWith(`/${entry}`) ? `\0${entry}` : null),
        load: (id) => (id === `\0${entry}` ? module : null),
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['iife'], name: 'WorldCollision' },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;

  if (!('output' in bundle) || bundle.output[0].type !== 'chunk') throw new Error('World worker did not compile.');

  return bundle.output[0].code;
}

async function measure(): Promise<Measurement> {
  const code = await workerCode();
  const runner = `
    const { parentPort } = require('node:worker_threads');
    ${code}
    parentPort.on('message', async (mesh) => {
      const started = performance.now();
      const pieces = await WorldCollision.decomposeWorld(mesh);
      parentPort.postMessage({ elapsed: performance.now() - started, triangles: mesh.indices.length / 3, pieces },
        pieces.flatMap((piece) => [piece.positions.buffer, piece.indices.buffer]));
    });
  `;
  const worker = new Worker(runner, { eval: true });
  const mesh = kitchen();

  try {
    return await new Promise<Measurement>((resolve, reject) => {
      worker.once('error', reject);
      worker.once('message', resolve);
      worker.postMessage(mesh, [mesh.positions.buffer, mesh.indices.buffer]);
    });
  } finally {
    await worker.terminate();
  }
}

function occupies(hull: WorldHull, point: Point): boolean {
  return point.every((value, axis) => {
    const values = Array.from(hull.positions).filter((_, index) => index % 3 === axis);

    return value >= Math.min(...values) && value <= Math.max(...values);
  });
}

describe('world decomposition speed', () => {
  it('decomposes a 200,000-triangle kitchen in a worker within 10 seconds and keeps its table gap open', async () => {
    const result = await measure();
    const maxVertices = Math.max(...result.pieces.map((piece) => piece.positions.length / 3));

    console.log(
      `world decomposition: ${result.elapsed.toFixed(1)} ms in worker, ${result.triangles} triangles, ${result.pieces.length} pieces, ${maxVertices} maximum vertices`,
    );
    expect(result.triangles).toBe(200_000);
    expect(result.elapsed).toBeLessThan(10_000);
    expect(result.pieces.length).toBeGreaterThanOrEqual(8);
    expect(result.pieces.length).toBeLessThanOrEqual(64);
    expect(maxVertices).toBeLessThanOrEqual(96);
    expect(result.pieces.some((piece) => occupies(piece, [0, 350, 1200]))).toBe(false);
    expect(result.pieces.some((piece) => occupies(piece, [0, 750, 1200]))).toBe(true);
  });
});
