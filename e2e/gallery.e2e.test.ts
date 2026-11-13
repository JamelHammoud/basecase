import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { parseCase } from '../src/cases/schema';
import { galleryBundleOf } from '../src/gallery/buildBundle';
import type { GalleryBundle } from '../src/gallery/galleryBundle';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { buildRig } from '../src/utils/kinematics';
import { COCKPIT, pushStick } from './codePanels';
import { exposeTestHooks, launchChrome, openPlayTab, shown } from './harness';
import { ARENA_LINE, stubHoldPose, stubTabGpu } from './holdPose';

let browser: Browser;
const base = inject('webUrl');

const PROBES = `<div id="out"></div>
<script>
const out = document.getElementById('out');
const mark = (name, value) => {
  const el = document.createElement('div');
  el.dataset.probe = name;
  el.textContent = value;
  out.append(el);
};
const settle = (name, run) => {
  try {
    Promise.resolve(run()).then((reached) => mark(name, reached ? 'allowed' : 'blocked'), () => mark(name, 'blocked'));
  } catch {
    mark(name, 'blocked');
  }
};
settle('indexedDB', () => indexedDB.databases().then((dbs) => dbs.length > 0));
settle('cookie', () => document.cookie.includes('hub'));
settle('hub', () => fetch('https://huggingface.co/api/repos/create', { method: 'POST', body: '{}' }).then(() => true));
</script>`;

interface GalleryState {
  status: string;
  drive: string;
  note: string | null;
  stats: { rtf: number; robots: Array<{ forward: number; fellAt: number | null }> } | null;
  controller: string;
  skill: { hash: string; steps: number } | null;
}

const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gallery?: { state: () => GalleryState } }).__gallery?.state() ?? null);

interface OpenOptions {
  viewport?: { width: number; height: number };
  gpu?: boolean;
  shared?: GalleryBundle;
}

const ACCOUNT = 'tester';

function sharedCase(console: unknown): GalleryBundle {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const kase = parseCase({
    ...presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts),
    id: 'rover-cockpit',
    name: 'Rover Cockpit',
    console,
  });

  return galleryBundleOf({
    slug: 'rover-cockpit-1a2b3c',
    title: 'Rover Cockpit: Two-wheel rover',
    robotName: 'Two-wheel rover',
    parts: rover.parts,
    joints: rover.joints,
    kase,
  });
}

async function serveShared(page: Page, bundle: GalleryBundle) {
  const hub: string[] = [];

  await page.route('https://huggingface.co/**', (route) => {
    hub.push(`${route.request().method()} ${route.request().url()}`);

    return route.abort();
  });
  await page.route(
    `https://huggingface.co/datasets/${ACCOUNT}/${bundle.slug}/resolve/main/basecase-robot.json`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(bundle),
      }),
  );

  return hub;
}

async function open(path: string, { viewport = { width: 1440, height: 900 }, gpu = false, shared }: OpenOptions = {}) {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];

  await exposeTestHooks(page);

  if (gpu) await page.addInitScript(stubTabGpu);

  const hub = shared ? await serveShared(page, shared) : [];

  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${base}${path}`);

  return { page, errors, hub };
}

beforeAll(async () => {
  browser = await launchChrome();
}, 120000);

afterAll(async () => {
  await browser?.close();
});

describe('gallery links', () => {
  it('drive a rover in the browser, at real time, under the web demo', async () => {
    const { page, errors } = await open('/c/rover-reach-the-flag');
    const card = page.getByTestId('gallery-card');

    await expect.poll(() => card.count(), { timeout: 60000 }).toBe(1);
    expect(await card.innerText()).not.toContain('simulation only');
    expect(await card.getByRole('button', { name: 'Train' }).count()).toBe(0);
    await expect.poll(async () => (await state(page))?.status, { timeout: 60000 }).toBe('ready');

    await card.getByRole('button', { name: 'Drive', exact: true }).click();
    await expect.poll(async () => (await state(page))?.drive, { timeout: 30000 }).toBe('on');
    await page.mouse.click(900, 450);
    await page.keyboard.down('w');
    await expect
      .poll(async () => (await state(page))?.stats?.robots[0].forward ?? 0, { timeout: 20000 })
      .toBeGreaterThan(0.1);
    await page.keyboard.up('w');

    const after = await state(page);

    expect(after?.stats?.rtf ?? 0).toBeGreaterThan(0.9);
    expect(errors).toEqual([]);
    await page.close();
  }, 240000);

  it('opens the scene in the studio from See Inside', async () => {
    const { page } = await open('/c/arm-touch-the-dots');

    await expect.poll(() => page.getByTestId('gallery-card').count(), { timeout: 60000 }).toBe(1);
    await page.getByRole('button', { name: 'See Inside' }).click();
    await page.waitForURL(`${base}/`);
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
      timeout: 60000,
    });
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __studio: { parts: () => unknown[] } }).__studio.parts().length),
      )
      .toBe(10);
    await page.close();
  }, 180000);

  it('teaches the hexapod to stand from its card, runs the skill, and carries it into the studio', async () => {
    const { page, errors } = await open('/c/hexapod-reach-the-flag', { gpu: true });
    const card = page.getByTestId('gallery-card');
    const cardStand = card.getByTestId('skill-row').filter({ hasText: 'Stand' });

    await expect.poll(async () => (await state(page))?.status, { timeout: 60000 }).toBe('ready');
    await page.evaluate(stubHoldPose, '__gallery' as const);
    await card.getByRole('button', { name: 'Train', exact: true }).click();
    await expect.poll(() => cardStand.count(), { timeout: 60000 }).toBe(1);
    await expect.poll(() => cardStand.innerText(), { timeout: 180000 }).toMatch(ARENA_LINE);
    await expect.poll(async () => (await state(page))?.controller, { timeout: 30000 }).toBe('policy');
    expect((await state(page))?.skill?.steps).toBe(1);

    await card.getByRole('button', { name: 'See Inside' }).click();
    await page.waitForURL(`${base}/`);
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
      timeout: 60000,
    });
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();

    const studioStand = page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

    await expect.poll(() => studioStand.innerText(), { timeout: 60000 }).toMatch(ARENA_LINE);
    expect(errors).toEqual([]);
    await page.close();
  }, 360000);

  it('keeps the landing page on phones, and says plainly when a link is wrong', async () => {
    const phone = await open('/c/rover-reach-the-flag', { viewport: { width: 390, height: 844 } });

    await expect.poll(() => phone.page.getByText('Build real robots').count(), { timeout: 30000 }).toBeGreaterThan(0);
    expect(await phone.page.getByTestId('gallery-card').count()).toBe(0);
    await phone.page.close();

    const missing = await open('/c/no-such-case');

    await expect.poll(() => missing.page.getByText('No Case here').count(), { timeout: 30000 }).toBe(1);
    await missing.page.close();
  }, 120000);
});

describe('shared Case apps', () => {
  it('runs a shared Case’s code panels, drives from its joystick, and carries them into the studio', async () => {
    const shared = sharedCase(COCKPIT);
    const { page, errors, hub } = await open(`/r/${ACCOUNT}/${shared.slug}`, { shared });
    const frame = (panel: string) => page.frameLocator(`[data-panel="${panel}"] iframe`);

    await expect.poll(async () => (await state(page))?.status, { timeout: 60000 }).toBe('ready');
    expect(await page.getByTestId('gallery-card').getByRole('button', { name: 'See Inside' }).count()).toBe(1);

    await pushStick(page, frame('stick').locator('canvas'));
    await expect.poll(async () => (await state(page))?.drive, { timeout: 60000 }).toBe('on');
    await expect
      .poll(async () => (await state(page))?.stats?.robots[0].forward ?? 0, { timeout: 20000 })
      .toBeGreaterThan(0.1);
    await expect
      .poll(async () => Number(await frame('hud').locator('[data-speed]').textContent()))
      .toBeGreaterThan(0.05);
    await page.mouse.up();
    expect(hub).toEqual([]);
    expect(errors).toEqual([]);

    await page.getByTestId('gallery-card').getByRole('button', { name: 'See Inside' }).click();
    await page.waitForURL(`${base}/`);
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
      timeout: 60000,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __studio: { sceneRecord: () => { project: { cases?: Array<{ console?: unknown }> } } };
              }
            ).__studio.sceneRecord().project.cases?.[0]?.console,
        ),
      )
      .toEqual(shared.case.console);

    await openPlayTab(page, 'Cases');
    await page.locator(shown('[data-testid="cases-panel"] button'), { hasText: 'Rover Cockpit' }).first().click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __studio: { simState: () => { activeCase: string | null } } }).__studio.simState()
              .activeCase,
        ),
      )
      .toBe('rover-cockpit');
    await page.keyboard.press('Meta+k');
    await page.keyboard.type('Run Case');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('[data-panel="stick"] iframe').count(), { timeout: 30000 }).toBe(1);
    await page.close();
  }, 240000);

  it('keeps a shared code panel away from the page’s IndexedDB, its cookies and the Hub', async () => {
    const shared = sharedCase({
      input: ['keys'],
      panels: [{ id: 'probes', kind: 'code', height: 160, source: PROBES }],
      layout: { areas: [{ canvas: true }, { size: 320, panels: ['probes'] }] },
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const hub = await serveShared(page, shared);

    await page.context().addCookies([{ name: 'hub', value: 'signed-in', url: base }]);
    await page.addInitScript(() => {
      if (window === window.top) indexedDB.open('basecase');
    });
    await page.goto(`${base}/r/${ACCOUNT}/${shared.slug}`);

    const probes = page.frameLocator('[data-panel="probes"] iframe').locator('[data-probe]');

    await expect.poll(() => probes.count(), { timeout: 60000 }).toBe(3);
    expect(
      Object.fromEntries(await probes.evaluateAll((els) => els.map((e) => [e.dataset.probe, e.textContent]))),
    ).toEqual({ indexedDB: 'blocked', cookie: 'blocked', hub: 'blocked' });
    expect(hub).toEqual([]);
    await page.close();
  }, 120000);
});
