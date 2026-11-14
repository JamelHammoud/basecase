import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { COCKPIT, pushStick } from './codePanels';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

interface SimState {
  drive: string;
  activeCase: string | null;
  stats: { time: number; robots: Array<{ forward: number }> } | null;
  worldLooks: Record<string, { color: string; visible: boolean }>;
  tries: Array<{ world: number }>;
}

interface WorldEvent {
  at: number;
  id: string;
  pose?: { position?: number[] };
  color?: string;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  agentRequest: (kind: string, payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  worldAt: () => Record<string, number[]>;
  tryWorld: () => Promise<WorldEvent[]>;
  cameraStreams: () => { frames: number; ms: number };
};

const WATCH = `<p data-frames style="margin:8px">0</p>
<script>
let n = 0;
basecase.frames('scene', { width: 320, fps: 15 }, (bitmap) => {
  n += 1;
  document.querySelector('[data-frames]').textContent = String(n);
  document.body.dataset.size = bitmap.width + 'x' + bitmap.height;
  bitmap.close();
});
</script>`;

const studio = () => app.page.evaluateHandle(() => (window as unknown as { __studio: Studio }).__studio);

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

const LAMP = {
  id: 'lamp',
  name: 'Lamp',
  kind: 'cylinder',
  position: [0, -300, 1],
  size: [120, 120, 2],
  color: '#555555',
  behavior: 'marker',
  movable: true,
};

const LIGHT = `<button data-light style="margin:8px">Light</button>
<script>
document.querySelector('[data-light]').addEventListener('click', () => {
  basecase.world.set('lamp', { pose: { position: [240, 1, 420] }, color: '#ff3b30' });
});
</script>`;

const rover = () => fixtureRobots().find((r) => r.id === 'rover-diff')!;

async function loadRover(cases: unknown[] = []) {
  const { page } = app;
  const { parts, joints } = rover();
  const scene = { name: 'rover-code', parts, project: { ...DEFAULT_PROJECT, joints, cases } };

  await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), scene);
  await expect.poll(() => partCount(page)).toBe(parts.length);
}

async function openCase(console: unknown) {
  const { page } = app;
  const { parts, joints } = rover();
  const preset = presetCase('reach-the-flag', buildRig(joints, parts), parts);

  await loadRover([{ ...preset, id: 'rover-code', name: 'Rover Cockpit', console }]);
  await openPlayTab(page, 'Cases');
  await page.locator(shown('[data-testid="cases-panel"] button'), { hasText: 'Rover Cockpit' }).first().click();
  await expect.poll(async () => (await simState()).activeCase).toBe('rover-code');
  await page.keyboard.press('Meta+k');
  await page.keyboard.type('Run Case');
  await page.keyboard.press('Enter');
  await expect.poll(areaCount).toBe(1);
}

async function askAgentForCase(payload: Record<string, unknown>) {
  await loadRover();

  const reply = await app.page.evaluate(
    (p) => (window as unknown as { __studio: Studio }).__studio.agentRequest('create_case', p),
    payload,
  );

  expect(reply).toMatchObject({ ok: true, running: true });
  await expect.poll(async () => (await simState()).activeCase).toBe(reply.id);
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

describe('Case code that shapes its world', () => {
  it('lights a target the agent made movable, from code during a try, and records the change', async () => {
    const { page } = app;
    const tries = (name: string) => page.locator(shown('[data-panel="tries"] button'), { hasText: name }).first();

    await askAgentForCase({
      goal: 'reach',
      name: 'Light the Lamp',
      objects: [LAMP],
      console: {
        input: ['keys'],
        panels: [
          { id: 'light', kind: 'code', title: 'Light', height: 80, source: LIGHT },
          { id: 'tries', kind: 'list', of: 'tries' },
        ],
        layout: { areas: [{ canvas: true }, { size: 320, panels: ['light', 'tries'] }] },
      },
    });

    await tries('Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    await expect.poll(() => tries('Stop Try').isVisible()).toBe(true);
    await expect
      .poll(async () => {
        await frameOf('light').locator('[data-light]').click();

        return (await simState()).worldLooks.lamp?.color;
      })
      .toBe('#ff3b30');

    const lamp = await (await studio()).evaluate((s) => s.worldAt().lamp);

    expect(Math.hypot(lamp[0] - 240, lamp[2] - 420)).toBeLessThan(1);

    await tries('Stop Try').click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
    expect((await simState()).tries[0].world).toBeGreaterThan(0);

    const recorded = await (await studio()).evaluate((s) => s.tryWorld());

    expect(recorded).toContainEqual(
      expect.objectContaining({ id: 'lamp', color: '#ff3b30', pose: { position: [240, 1, 420] } }),
    );
    expect(app.errors).toEqual([]);
  });

  it('streams a camera to code at the asked size and rate, cheaply on the main thread, and stops with the Case', async () => {
    const { page } = app;
    const streams = async () => (await studio()).evaluate((s) => s.cameraStreams());
    const shown = () => frameOf('watch').locator('[data-frames]').textContent().then(Number);

    await openCase({
      input: ['keys'],
      panels: [{ id: 'watch', kind: 'code', title: 'Watch', height: 80, source: WATCH }],
      layout: { areas: [{ canvas: true }, { size: 320, panels: ['watch'] }] },
    });

    await expect.poll(shown, { timeout: 60000 }).toBeGreaterThan(5);
    expect(await frameOf('watch').locator('body').getAttribute('data-size')).toBe('320x240');

    const [before, from] = [await shown(), Date.now()];

    await expect.poll(shown, { timeout: 60000 }).toBeGreaterThanOrEqual(before + 30);

    const rate = ((await shown()) - before) / ((Date.now() - from) / 1000);
    const cost = await streams();

    expect(rate).toBeLessThanOrEqual(16);
    expect(cost.ms / cost.frames).toBeLessThan(2);

    await page.keyboard.press('Escape');
    await expect.poll(areaCount).toBe(0);

    const stopped = (await streams()).frames;

    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          let left = 60;
          const tick = () => (--left ? requestAnimationFrame(tick) : done());

          requestAnimationFrame(tick);
        }),
    );
    expect((await streams()).frames).toBe(stopped);
  });
});
