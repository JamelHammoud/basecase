import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { COCKPIT, FRAME_COUNTER, LIT, LIT_AT, pushStick, WHACK_BUTTONS } from './codePanels';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  activeCase: string | null;
  stats: { time: number; robots: Array<{ forward: number }> } | null;
  tryPhase: string;
  store: Record<string, unknown> | null;
  tries: Array<{ world: number }>;
  objects: Array<{ id: string; position: number[]; color: string; visible: boolean }>;
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

const BEACON = {
  id: 'beacon',
  name: 'Beacon',
  kind: 'sphere',
  position: [0, 1, 600],
  rotation: [0, 0, 0],
  size: [40, 40, 40],
  color: '#5a5a5a',
  behavior: 'marker',
  movable: true,
};

function roverScene(console: unknown) {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const preset = presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts);
  const kase = {
    ...preset,
    id: 'rover-code',
    name: 'Rover Cockpit',
    world: { objects: [...preset.world.objects, BEACON] },
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

    await openCase(COCKPIT);

    const hud = await page.locator('[data-testid="case-run-overlay"][data-panel="hud"]').boundingBox();
    const under = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.tagName,
      [hud!.x + hud!.width / 2, hud!.y + hud!.height / 2],
    );

    expect(under).toBe('CANVAS');

    await pushStick(page, frameOf('stick').locator('canvas'));
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

describe('Case code panels’ world, store and frames', () => {
  it('lights a target through world.set during a try, records it, and keeps the code’s score in the Case', async () => {
    const press = (go: string) => frameOf('game').locator(`[data-go="${go}"]`).click();
    const beacon = async () => (await simState()).objects.find((o) => o.id === 'beacon');
    const pressUntil = <T>(go: string, read: () => Promise<T>, timeout = 30000) =>
      expect.poll(
        async () => {
          await press(go);

          return read();
        },
        { timeout, interval: 500 },
      );

    await openCase({
      input: ['code', 'keys'],
      panels: [{ id: 'game', kind: 'code', height: 160, source: WHACK_BUTTONS }],
      layout: { areas: [{ canvas: true }, { size: 320, panels: ['game'] }] },
    });

    await pressUntil('try', async () => (await simState()).tryPhase !== 'idle', 60000).toBe(true);
    await expect.poll(async () => (await simState()).tryPhase, { timeout: 60000 }).toBe('running');
    await pressUntil('light', async () => (await beacon())?.color).toBe(LIT);
    expect((await beacon())?.position.map(Math.round)).toEqual(LIT_AT);
    await expect.poll(async () => (await simState()).store).toEqual({ score: 42 });

    await pressUntil('end', async () => (await simState()).tries.length).toBe(1);
    expect((await simState()).tries[0].world).toBeGreaterThanOrEqual(1);
    expect((await simState()).store).toEqual({ score: 42 });

    await expect
      .poll(async () => {
        await app.page.keyboard.press('Escape');

        return areaCount();
      })
      .toBe(0);
    expect(app.errors).toEqual([]);
  });

  it('sends a panel camera frames at its size and rate for under 2 ms of the page’s thread each, and none after it stops', async () => {
    const counter = () => frameOf('eye').locator('[data-frames]');
    const frames = async () => Number(await counter().getAttribute('data-frames'));
    const cdp = await app.page.context().newCDPSession(app.page);
    const busy = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics');

      return (metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0) * 1000;
    };
    const measure = async () => {
      const [ms, n] = [await busy(), await frames()];

      await new Promise((done) => setTimeout(done, 3000));

      return { ms: (await busy()) - ms, frames: (await frames()) - n };
    };

    await openCase({
      input: ['code', 'keys'],
      panels: [{ id: 'eye', kind: 'code', height: 120, source: FRAME_COUNTER }],
      layout: { areas: [{ canvas: true }, { size: 320, panels: ['eye'] }] },
    });
    await cdp.send('Performance.enable');

    const idle = await measure();

    await expect
      .poll(
        async () => {
          await frameOf('eye').locator('[data-go="watch"]').click();

          return frames();
        },
        { timeout: 60000, interval: 1000 },
      )
      .toBeGreaterThan(5);
    expect(await counter().getAttribute('data-size')).toBe('320x240');

    const watching = await measure();
    const perFrame = (watching.ms - idle.ms) / watching.frames;

    console.info(`Code frames: ${watching.frames} in 3 s, ${perFrame.toFixed(2)} ms of the page's thread each`);
    expect(watching.frames).toBeGreaterThanOrEqual(30);
    expect(watching.frames).toBeLessThanOrEqual(46);
    expect(perFrame).toBeLessThan(2);

    await frameOf('eye').locator('[data-go="stop"]').click();
    await new Promise((done) => setTimeout(done, 300));

    const stopped = await frames();

    await new Promise((done) => setTimeout(done, 1000));
    expect(await frames()).toBe(stopped);
  });
});
