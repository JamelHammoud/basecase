import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  activeCase: string | null;
  stats: { time: number; robots: Array<{ forward: number }> } | null;
}

type Studio = { simState: () => SimState; load: (r: unknown) => void };

const simState = () => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState());

const areaCount = () => app.page.locator(shown('[data-testid="case-run-area"]')).count();

const frameOf = (panel: string) => app.page.frameLocator(`[data-panel="${panel}"] iframe`);

const framesUntil = (selector: string) =>
  app.page.evaluate(
    (until) =>
      new Promise<number>((done) => {
        let frames = 0;

        const tick = () => {
          frames++;

          if (document.querySelector(until)) done(frames);
          else requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      }),
    selector,
  );

const JOYSTICK = `<canvas width="200" height="200" style="display:block;margin:auto;touch-action:none"></canvas>
<script>
const pad = document.querySelector('canvas');
const g = pad.getContext('2d');
const draw = (x, y) => {
  g.clearRect(0, 0, 200, 200);
  g.fillStyle = getComputedStyle(document.body).getPropertyValue('--bc-surface');
  g.beginPath(); g.arc(100, 100, 90, 0, 6.29); g.fill();
  g.fillStyle = getComputedStyle(document.body).getPropertyValue('--bc-accent');
  g.beginPath(); g.arc(100 + x * 70, 100 + y * 70, 26, 0, 6.29); g.fill();
};
const clamp = (n) => Math.max(-1, Math.min(1, n));
const move = (e) => {
  const x = clamp((e.offsetX - 100) / 70);
  const y = clamp((e.offsetY - 100) / 70);
  draw(x, y);
  basecase.drive({ v: [-y, 0, -x] });
};
pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); basecase.action('drive'); move(e); });
pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) move(e); });
pad.addEventListener('pointerup', () => { draw(0, 0); basecase.drive(null); });
draw(0, 0);
</script>`;

const HUD = `<div style="padding:8px 12px;font-size:var(--bc-text);color:var(--bc-ink)">
  <b data-speed>0.00</b> m/s, tilt <b data-tilt>0</b>°
</div>
<script>
basecase.signals(['robot.speed', 'robot.tilt'], (v) => {
  document.querySelector('[data-speed]').textContent = (v['robot.speed'] ?? 0).toFixed(2);
  document.querySelector('[data-tilt]').textContent = (v['robot.tilt'] ?? 0).toFixed(0);
});
</script>`;

const PROBES = (base: string) => `<div id="out"></div>
<script>
const out = document.getElementById('out');
const mark = (name, value) => {
  const el = document.createElement('div');
  el.dataset.probe = name;
  el.textContent = value;
  out.append(el);
};
const probe = (name, run) => {
  try { run(); mark(name, 'allowed'); } catch { mark(name, 'blocked'); }
};
fetch('${base}/fetch').then(() => mark('fetch', 'allowed'), () => mark('fetch', 'blocked'));
const socket = new WebSocket('${base.replace('http', 'ws')}/socket');
socket.onopen = () => mark('socket', 'allowed');
socket.onerror = () => mark('socket', 'blocked');
probe('top', () => { top.location = '${base}/top'; });
probe('parent', () => parent.document.title);
probe('storage', () => localStorage.setItem('code', 'panel'));
</script>`;

const SPIN = '<p>Spinning</p><script>while (true) {}</script>';

const AWAY = (base: string) => `<script>location.href = '${base}/self';</script>`;

function roverScene(console: unknown) {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const kase = {
    ...presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts),
    id: 'rover-code',
    name: 'Rover Cockpit',
    console,
  };

  return {
    name: 'rover-code',
    parts: rover.parts,
    project: { ...DEFAULT_PROJECT, joints: rover.joints, cases: [kase] },
  };
}

async function openCase(console: unknown) {
  const { page } = app;
  const scene = roverScene(console);

  await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
  await expect.poll(() => partCount(page)).toBe(scene.parts.length);
  await openPlayTab(page, 'Cases');
  await page.locator(shown('[data-testid="cases-panel"] button'), { hasText: 'Rover Cockpit' }).first().click();
  await expect.poll(async () => (await simState()).activeCase).toBe('rover-code');
  await page.keyboard.press('Meta+k');
  await page.keyboard.type('Run Case');
  await page.keyboard.press('Enter');
  await expect.poll(areaCount).toBe(1);
}

beforeEach(async () => {
  app = await openApp();
}, 120000);

afterEach(async () => {
  await app?.close();
});

describe('Case code panels', () => {
  it('drives the rover from a code joystick, shows its speed in a HUD overlay, and leaves on Esc pressed inside', async () => {
    const { page } = app;

    await openCase({
      input: ['code', 'keys'],
      panels: [
        { id: 'stick', kind: 'code', title: 'Stick', height: 240, source: JOYSTICK },
        { id: 'hud', kind: 'code', source: HUD },
      ],
      layout: {
        areas: [
          { canvas: true, overlays: [{ panel: 'hud', anchor: 'top-left', width: 240, height: 48 }] },
          { size: 320, panels: ['stick'] },
        ],
      },
    });

    const hud = await page.locator('[data-testid="case-run-overlay"][data-panel="hud"]').boundingBox();
    const under = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.tagName,
      [hud!.x + hud!.width / 2, hud!.y + hud!.height / 2],
    );

    expect(under).toBe('CANVAS');

    const pad = frameOf('stick').locator('canvas');
    const box = await pad.boundingBox();
    const [cx, cy] = [box!.x + box!.width / 2, box!.y + box!.height / 2];
    let nudge = 0;

    await expect
      .poll(async () => {
        await page.mouse.move(cx + (nudge++ % 2), cy);

        return pad.evaluate((el) => el.matches(':hover'));
      })
      .toBe(true);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 70, { steps: 4 });
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    await expect.poll(async () => (await simState()).stats?.robots[0].forward ?? 0).toBeGreaterThan(0.1);
    await expect
      .poll(async () => Number(await frameOf('hud').locator('[data-speed]').textContent()))
      .toBeGreaterThan(0.05);
    await page.mouse.up();

    await page.keyboard.press('Escape');
    await expect.poll(async () => (await simState()).drive).toBe('off');
    await page.keyboard.press('Escape');
    await expect.poll(areaCount).toBe(0);
    expect(app.errors).toEqual([]);
  });

  it('keeps a code panel off the network, the parent and storage', async () => {
    const { page } = app;
    const hits: string[] = [];
    const server = http.createServer((req, res) => {
      hits.push(req.url ?? '');
      res.end('reached');
    });

    server.on('upgrade', (req, socket) => {
      hits.push(`upgrade ${req.url}`);
      socket.destroy();
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));

    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      await openCase({
        input: ['code', 'keys'],
        panels: [
          { id: 'probes', kind: 'code', height: 160, source: PROBES(base) },
          { id: 'away', kind: 'code', height: 80, source: AWAY(base) },
        ],
        layout: { areas: [{ canvas: true }, { size: 320, panels: ['probes', 'away'] }] },
      });

      const probes = frameOf('probes').locator('[data-probe]');

      await expect.poll(() => probes.count()).toBe(5);
      expect(
        Object.fromEntries(await probes.evaluateAll((els) => els.map((e) => [e.dataset.probe, e.textContent]))),
      ).toEqual({
        fetch: 'blocked',
        socket: 'blocked',
        top: 'blocked',
        parent: 'blocked',
        storage: 'blocked',
      });
      expect(hits).toEqual([]);

      await page.keyboard.press('Escape');
      await expect.poll(areaCount).toBe(0);
      expect(hits).toEqual([]);
    } finally {
      server.close();
    }
  });

  it('unloads a panel that never answers with its error, while the page keeps drawing frames', async () => {
    const { page } = app;
    const failed = '[data-panel="spin"] [data-testid="code-failed"]';

    await openCase({
      input: ['keys'],
      panels: [{ id: 'spin', kind: 'code', title: 'Spin', height: 80, source: SPIN }],
      layout: { areas: [{ canvas: true }, { size: 320, panels: ['spin'] }] },
    });

    expect(await framesUntil(failed)).toBeGreaterThan(3);
    expect(await page.locator(failed).textContent()).toBe('Couldn’t run Spin. It didn’t answer.');
    expect(await page.locator('[data-panel="spin"] iframe').count()).toBe(0);

    await page.keyboard.press('Escape');
    await expect.poll(areaCount).toBe(0);
  });
});
