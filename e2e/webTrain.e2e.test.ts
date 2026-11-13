import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { exposeTestHooks, launchChrome, partCount, shown } from './harness';
import { ARENA_LINE, stubHoldPose, stubTabGpu } from './holdPose';

interface Studio {
  load: (record: unknown) => void;
  simState: () => { status: string };
}

let browser: Browser;
let page: Page;
const errors: string[] = [];

const studio = () =>
  page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
    timeout: 60000,
  });

const standRow = () => page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

async function openSimulate() {
  await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
  await expect.poll(() => page.locator(shown('[data-testid="skill-row"]')).count(), { timeout: 60000 }).toBe(4);
}

function savedCounts() {
  type Scene = { project?: { skills?: unknown[] } };

  return new Promise<{ records: number; files: number }>((resolve, reject) => {
    const open = indexedDB.open('basecase');

    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(['scenes', 'skills']);
      const scenes = tx.objectStore('scenes').getAll();
      const files = tx.objectStore('skills').count();
      const finish = () => {
        const counts = (scenes.result as Scene[]).map((scene) => scene.project?.skills?.length ?? 0);

        open.result.close();
        resolve({ records: Math.max(0, ...counts), files: files.result });
      };

      tx.oncomplete = finish;
    };
  });
}

const stored = () => page.evaluate(savedCounts);

beforeAll(async () => {
  browser = await launchChrome();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await exposeTestHooks(page);
  await page.addInitScript(stubTabGpu);
  await page.goto(`${inject('webUrl')}/`);
  await studio();
}, 120000);

afterAll(async () => {
  await browser?.close();
});

describe('training in the web studio', () => {
  it('trains Stand on the tab engine, passes Arena, and keeps it through a reload', async () => {
    const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;

    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'quad-servo',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    });
    await expect.poll(() => partCount(page)).toBe(robot.parts.length);
    await page.evaluate(stubHoldPose, '__studio' as const);
    await openSimulate();
    expect(await page.locator(shown('[data-testid="teach-field"]')).count()).toBe(0);

    await standRow().getByRole('button', { name: 'Train' }).click();
    await expect.poll(() => standRow().innerText(), { timeout: 180000 }).toMatch(ARENA_LINE);
    await expect.poll(stored, { timeout: 20000 }).toEqual({ records: 1, files: 1 });

    await page.reload();
    await studio();
    await openSimulate();
    await expect.poll(() => standRow().innerText(), { timeout: 30000 }).toMatch(ARENA_LINE);

    await standRow().getByRole('button', { name: 'Try' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().status), {
        timeout: 30000,
      })
      .not.toBe('off');
    expect(errors).toEqual([]);
  }, 360000);
});
