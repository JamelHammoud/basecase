import type { Page } from 'playwright-core';
import { expect, inject, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { skillHash, type Skill } from '../src/skills/artifacts';
import { DEFAULT_PROJECT, type ProjectSettings } from '../src/types/robotics';
import { exposeTestHooks, launchChrome, partCount, shown } from './harness';
import { ARENA_LINE, stubHoldPose, stubTabGpu } from './holdPose';
import { stubWebTrainWorker } from './webTrainWorker';

interface Studio {
  load: (record: unknown) => void;
  sceneRecord: () => { project: ProjectSettings };
  simState: () => {
    status: string;
    stats: { time: number } | null;
    controller: { kind: string; trainedSteps: number | null };
  };
}

const studioReady = (page: Page) =>
  page.waitForFunction(() => Boolean((window as unknown as { __studio?: Studio }).__studio));

const standRow = (page: Page) => page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

async function openSimulate(page: Page) {
  await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
  await expect.poll(() => page.locator(shown('[data-testid="skill-row"]')).count()).toBe(4);
}

function savedTraining() {
  return new Promise<{ scenes: Array<{ name: string; project: ProjectSettings }>; skills: Skill[] }>(
    (resolve, reject) => {
      const open = indexedDB.open('basecase');

      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(['scenes', 'skills']);
        const scenes = tx.objectStore('scenes').getAll();
        const skills = tx.objectStore('skills').getAll();

        tx.oncomplete = () => {
          db.close();
          resolve({ scenes: scenes.result, skills: skills.result.map((text: string) => JSON.parse(text) as Skill) });
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
    },
  );
}

it('trains from the web studio, keeps the scene and skill across reload, and plays it with Try', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    const trained = await stubWebTrainWorker(page);
    const robot = fixtureRobots().find((candidate) => candidate.id === 'quad-servo')!;

    await exposeTestHooks(page);
    await page.addInitScript(stubTabGpu);
    await page.goto(inject('webUrl'));
    await studioReady(page);
    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'Web training quad',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    });
    await expect.poll(() => partCount(page)).toBe(robot.parts.length);
    await page.evaluate(stubHoldPose, '__studio' as const);
    await openSimulate(page);
    expect(await page.locator(shown('[data-testid="teach-field"]')).count()).toBe(0);
    await standRow(page).getByRole('button', { name: 'Train', exact: true }).click();
    await expect.poll(() => standRow(page).innerText()).toMatch(ARENA_LINE);
    expect(trained).toHaveLength(1);
    await expect
      .poll(async () => (await page.evaluate(savedTraining)).scenes)
      .toContainEqual(
        expect.objectContaining({
          name: 'Web training quad',
          project: expect.objectContaining({
            skills: [expect.objectContaining({ hash: trained[0], kit: 'stand' })],
          }),
        }),
      );

    const saved = await page.evaluate(savedTraining);

    expect(saved.skills).toHaveLength(1);
    expect(skillHash(saved.skills[0])).toBe(trained[0]);
    expect(saved.skills[0].controller).toMatchObject({ kind: 'policy', policy: { trainedSteps: 1 } });
    await page.reload();
    await studioReady(page);
    await expect.poll(() => partCount(page)).toBe(robot.parts.length);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.sceneRecord()))
      .toMatchObject({ project: { skills: [{ hash: trained[0], kit: 'stand' }] } });
    await openSimulate(page);
    await expect.poll(() => standRow(page).innerText()).toMatch(ARENA_LINE);
    await standRow(page).getByRole('button', { name: 'Try', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState()))
      .toMatchObject({ status: 'ready', controller: { kind: 'policy', trainedSteps: 1 } });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().stats?.time ?? 0))
      .toBeGreaterThan(0);
    expect((await page.evaluate(savedTraining)).skills).toEqual(saved.skills);
    expect(trained).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
