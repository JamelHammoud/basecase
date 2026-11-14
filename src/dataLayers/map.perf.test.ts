import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const POINTS = 200_000;
const SWEEPS = 20;
const LIMIT_MS = 10_000;

function fixture(): Float32Array<ArrayBuffer> {
  const points = new Float32Array(POINTS * 3);

  for (let i = 0; i < POINTS; i++) {
    points[i * 3] = (i % 1000) * 0.06 + 0.025;
    points[i * 3 + 1] = Math.floor(i / 1000) * 0.06 + 0.025;
    points[i * 3 + 2] = 0.1 * Math.sin(points[i * 3]) + 0.1 * Math.cos(points[i * 3 + 1]);
  }

  return points;
}

async function workerCode(): Promise<string> {
  const entry = 'map-perf';
  const module = `export { ScanMap } from ${JSON.stringify(fileURLToPath(new URL('./map.ts', import.meta.url)))}; export { Matrix4 } from 'three';`;
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
      lib: { entry, formats: ['iife'], name: 'MapCore' },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;

  if (!('output' in bundle) || bundle.output[0].type !== 'chunk') throw new Error('Map worker did not compile.');

  return bundle.output[0].code;
}

interface Measurement {
  elapsed: number;
  count: number;
  sweeps: number;
  matched: boolean;
}

async function measure(): Promise<Measurement> {
  const code = await workerCode();
  const runner = `
    const { parentPort } = require('node:worker_threads');
    ${code}
    parentPort.on('message', ({ points, sweeps }) => {
      const started = performance.now();
      const map = new MapCore.ScanMap();
      const pose = new MapCore.Matrix4();
      const size = points.length / sweeps;

      for (let i = 0; i < sweeps * 2; i++) {
        const at = (i % sweeps) * size;
        map.add({ points: points.subarray(at, at + size), pose });
      }

      const cloud = map.points();
      parentPort.postMessage({ elapsed: performance.now() - started, count: cloud.length / 3, sweeps: map.sweeps, matched: map.match });
    });
  `;
  const worker = new Worker(runner, { eval: true });
  const points = fixture();

  try {
    return await new Promise<Measurement>((resolve, reject) => {
      worker.once('error', reject);
      worker.once('message', resolve);
      worker.postMessage({ points, sweeps: SWEEPS }, [points.buffer]);
    });
  } finally {
    await worker.terminate();
  }
}

describe('map fusion speed', () => {
  it('builds a 200,000-point map and matches repeated sweeps in a worker within 10 seconds', async () => {
    const result = await measure();

    console.log(
      `map fusion: ${result.elapsed.toFixed(1)} ms, ${POINTS * 2} returns, ${result.count} map points, ${result.sweeps} sweeps`,
    );
    expect(result.elapsed).toBeLessThan(LIMIT_MS);
    expect(result.count).toBeGreaterThanOrEqual(POINTS);
    expect(result.sweeps).toBe(SWEEPS * 2);
    expect(result.matched).toBe(true);
  });
});
