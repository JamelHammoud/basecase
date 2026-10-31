#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBenchPage, serveStatic, waitQuiet } from './benchPage.mjs';
import { hardwareFixture } from './fixtureHardware.mjs';
import { fixtureScene } from './fixtureScene.mjs';
import { installViewportProbes, summarizeFrames } from './viewportProbes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (flag(name) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const outDir = path.resolve(option('dist', path.join(root, 'node_modules/.cache/perf-viewport/dist')));
const orbitMs = Number(option('ms', 4000));
const gpu = !flag('cpu') && process.platform === 'darwin';

function buildApp() {
  if ((flag('no-build') || flag('dist')) && fs.existsSync(outDir)) return;

  const built = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: root,
    stdio: 'inherit',
  });

  if (built.status !== 0) process.exit(built.status ?? 1);
}

function loadScene() {
  const file = option('scene', '');

  if (file) return JSON.parse(fs.readFileSync(path.resolve(file), 'utf-8'));

  const record = fixtureScene();

  return { ...record, joints: undefined, parts: [...record.parts, ...hardwareFixture(record.parts)] };
}

function gpuProcessMs(trace) {
  const events = JSON.parse(trace.toString()).traceEvents;
  const gpuPids = new Set(
    events.filter((e) => e.name === 'process_name' && /GPU/i.test(e.args?.name ?? '')).map((e) => e.pid),
  );
  const mainThreads = new Set(
    events
      .filter((e) => e.name === 'thread_name' && gpuPids.has(e.pid) && /CrGpuMain/.test(e.args?.name ?? ''))
      .map((e) => `${e.pid}:${e.tid}`),
  );

  return (
    events
      .filter((e) => e.ph === 'X' && e.name === 'ThreadControllerImpl::RunTask' && mainThreads.has(`${e.pid}:${e.tid}`))
      .reduce((sum, e) => sum + e.dur, 0) / 1000
  );
}

async function traced(browser, page, run) {
  await browser.startTracing(page, { categories: ['toplevel', '__metadata'] });

  const result = await run();
  const gpuMs = gpuProcessMs(await browser.stopTracing());

  return { ...result, gpuMs };
}

async function orbit(page, ms) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const canvas = document.querySelector('canvas');
        const box = canvas.getBoundingClientRect();
        const end = performance.now() + duration;
        const wheel = () => {
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

          if (performance.now() < end) requestAnimationFrame(wheel);
          else resolve(window.__viewportFrames.splice(0));
        };

        window.__viewportFrames.length = 0;
        requestAnimationFrame(wheel);
      }),
    ms,
  );
}

buildApp();

const scene = loadScene();
const server = await serveStatic(outDir);
const app = await openBenchPage({ url: server.url, scene, gpu, probes: installViewportProbes });
const loadMs = await waitQuiet(app.page);

await app.page.waitForTimeout(1500);

await app.page.evaluate(() => (window.__viewportFrames.length = 0));
await app.page.waitForTimeout(5200);

const idle = summarizeFrames(await app.page.evaluate(() => window.__viewportFrames.splice(0)));
const profile = option('profile', '');
const cdp = profile ? await app.page.context().newCDPSession(app.page) : null;

if (cdp) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
}

const orbited = await traced(app.browser, app.page, async () => ({ frames: await orbit(app.page, orbitMs) }));

if (cdp) fs.writeFileSync(path.resolve(profile), JSON.stringify((await cdp.send('Profiler.stop')).profile));

const orbiting = summarizeFrames(orbited.frames);

orbiting.gpuProcessPerFrame = Math.round((orbited.gpuMs / Math.max(1, orbiting.rendered)) * 100) / 100;

console.log(`Scene: ${scene.name}, ${scene.parts.length} parts. Settled in ${(loadMs / 1000).toFixed(1)} s.`);
console.log(`${gpu ? 'Metal' : 'SwiftShader'}, 1440 × 900.\n`);
console.log('Orbit', orbitMs, 'ms');
console.table({ orbit: orbiting, idle });

if (app.errors.length) console.log('Page errors:', app.errors);

await app.browser.close();
server.close();
