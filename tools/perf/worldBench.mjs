import fs from 'node:fs';
import path from 'node:path';
import { kitchenCollider, kitchenSplat } from '../../src/cases/worldImportFixture.ts';
import { openBenchPage, serveStatic, waitQuiet } from './benchPage.mjs';
import { installViewportProbes, summarizeFrames } from './viewportProbes.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => {
  const index = args.indexOf(`--${key}`);

  return index < 0 ? fallback : args[index + 1];
};
const sceneFile = option('scene', '');

if (!sceneFile) throw new Error('Pass --scene with a saved scene containing a rover.');

const directory = path.resolve(option('dist', 'dist'));
const budgetMs = Number(option('budget', '16'));
const durationMs = Number(option('ms', '4000'));
const gpu = !args.includes('--cpu') && process.platform === 'darwin';
const scene = JSON.parse(fs.readFileSync(path.resolve(sceneFile), 'utf8'));
const server = await serveStatic(directory);
const app = await openBenchPage({ url: server.url, scene, gpu, probes: installViewportProbes });

function gpuProcessMs(trace) {
  const events = JSON.parse(trace.toString()).traceEvents;
  const processes = new Set(
    events
      .filter((event) => event.name === 'process_name' && /GPU/i.test(event.args?.name ?? ''))
      .map((event) => event.pid),
  );
  const threads = new Set(
    events
      .filter(
        (event) => event.name === 'thread_name' && processes.has(event.pid) && /CrGpuMain/.test(event.args?.name ?? ''),
      )
      .map((event) => `${event.pid}:${event.tid}`),
  );

  return events
    .filter(
      (event) =>
        event.ph === 'X' && event.name === 'ThreadControllerImpl::RunTask' && threads.has(`${event.pid}:${event.tid}`),
    )
    .reduce((total, event) => total + event.dur / 1000, 0);
}

async function dropWorld() {
  const files = [kitchenCollider(), kitchenSplat(1_000_000)].map((file) => ({
    name: file.name,
    base64: Buffer.from(file.bytes).toString('base64'),
  }));

  await app.page.evaluate((payload) => window.__studio.dropFiles(payload), files);

  const card = app.page.locator('[data-testid="new-case"]:not([inert] *)');

  await card.waitFor();
  await card.locator('[role=radio]', { hasText: 'Reach a Spot' }).click();
  await card.locator('button', { hasText: 'Make Case' }).click();
  await app.page.waitForFunction(() => {
    const world = window.__studio.worldState();

    return world?.loaded && world.splatCount === 1_000_000 && world.renderedSplats === 1_000_000;
  });
}

async function orbit() {
  return app.page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const canvas = document.querySelector('main canvas');
        const box = canvas.getBoundingClientRect();
        const end = performance.now() + ms;
        const next = () => {
          canvas.dispatchEvent(
            new WheelEvent('wheel', {
              deltaX: 9,
              deltaY: 2,
              clientX: box.x + box.width / 2,
              clientY: box.y + box.height / 2,
              bubbles: true,
              cancelable: true,
            }),
          );

          if (performance.now() < end) requestAnimationFrame(next);
          else resolve(window.__viewportFrames.splice(0));
        };

        window.__viewportFrames.length = 0;
        requestAnimationFrame(next);
      }),
    durationMs,
  );
}

try {
  await dropWorld();
  await waitQuiet(app.page);
  await orbit();
  await app.browser.startTracing(app.page, { categories: ['toplevel', '__metadata'] });

  const frames = await orbit();
  const trace = await app.browser.stopTracing();
  const report = summarizeFrames(frames);
  const gpuMs = gpuProcessMs(trace) / Math.max(1, report.rendered);
  const passed = report.rendered > 0 && report.workP95 <= budgetMs && gpuMs <= budgetMs && app.errors.length === 0;
  const result = {
    backend: gpu ? 'Metal' : 'SwiftShader',
    points: 1_000_000,
    viewport: [1440, 900],
    budgetMs,
    ...report,
    gpuProcessPerFrame: gpuMs,
    passed,
    errors: app.errors,
  };
  const output = option('output', 'scratch/perf/world.json');

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  if (!passed) process.exitCode = 1;
} finally {
  await app.browser.close();
  server.close();
}
