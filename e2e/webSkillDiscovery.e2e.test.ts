import type { Page } from 'playwright-core';
import { expect, inject, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { skillHash, type Skill } from '../src/skills/artifacts';
import { fixtureModel } from '../src/skills/fixtureModels';
import { publishedSkillFiles } from '../src/skills/hubSkill';
import { kitEnvironment } from '../src/skills/kitEnvironment';
import { DEFAULT_PROJECT, type ProjectSettings } from '../src/types/robotics';
import { commitSha } from './fakeHub';
import { exposeTestHooks, launchChrome, partCount, shown } from './harness';
import { ARENA_LINE, stubHoldPose, stubTabGpu } from './holdPose';
import { stubWebSkillHub } from './webSkillHub';
import { readyKit, stubWebTrainWorker, type KitJob } from './webTrainWorker';

interface Studio {
  load: (record: unknown) => void;
  sceneRecord: () => { project: ProjectSettings };
}

const studioReady = (page: Page) =>
  page.waitForFunction(() => Boolean((window as unknown as { __studio?: Studio }).__studio));

async function openInstall(page: Page) {
  await page.keyboard.press('Meta+k');
  await page.keyboard.type('Install Skill');
  await page.locator(shown('button[data-idx="0"]'), { hasText: 'Install Skill' }).click();
}

const walkRow = (page: Page) => page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Walk' }).first();

function savedSkills() {
  return new Promise<Skill[]>((resolve, reject) => {
    const open = indexedDB.open('basecase');

    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('skills');
      const request = tx.objectStore('skills').getAll();

      tx.oncomplete = () => {
        db.close();
        resolve(request.result.map((text: string) => JSON.parse(text) as Skill));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

function savedSceneRecords() {
  return new Promise<{ project: ProjectSettings }[]>((resolve, reject) => {
    const open = indexedDB.open('basecase');

    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('scenes');
      const request = tx.objectStore('scenes').getAll();

      tx.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

it('installs a ranked pinned Walk through the web palette and restores its target evidence after reload', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const hub = await stubWebSkillHub(page);
  const model = fixtureModel('quad-servo');
  const source = readyKit({ model, design: 'published-quad', entry: 'velocity-tracking' });
  const repo = 'tester/quad-walk';
  const jobs: KitJob[] = [];
  const errors: string[] = [];

  hub.seed(
    repo,
    publishedSkillFiles({ skill: source, environment: kitEnvironment(model, 'velocity-tracking'), model }),
    'model',
  );
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    const trained = await stubWebTrainWorker(page, jobs);
    const robot = fixtureRobots().find((candidate) => candidate.id === 'quad-servo')!;

    await exposeTestHooks(page);
    await page.addInitScript(stubTabGpu);
    await page.goto(inject('webUrl'));
    await studioReady(page);
    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'Installed web quad',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    });
    await expect.poll(() => partCount(page)).toBe(robot.parts.length);
    await page.evaluate(stubHoldPose, '__studio' as const);
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await openInstall(page);

    const candidate = page.getByTestId('published-skill');

    await expect.poll(() => candidate.getAttribute('data-repo')).toBe(repo);
    hub.seed(repo, {}, 'model');
    await candidate.getByRole('button', { name: 'Install', exact: true }).click();
    await expect.poll(() => walkRow(page).innerText()).toMatch(ARENA_LINE);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ entry: 'velocity-tracking', warm: { from: skillHash(source) } });
    expect(
      hub.requests
        .filter((request) => request.path.includes('/resolve/'))
        .every((request) => request.path.includes(`/resolve/${commitSha(repo, 1)}/`)),
    ).toBe(true);
    await expect.poll(() => page.evaluate(savedSkills)).toHaveLength(1);

    const [saved] = await page.evaluate(savedSkills);

    expect(saved.warmStartFrom).toBe(skillHash(source));
    expect(saved.binding.design).toBe(jobs[0].design);
    expect(saved.evidence?.binding.physics).toBe(saved.binding.physics);
    expect(saved.evidence?.passed).toBe(true);
    expect(skillHash(saved)).toBe(trained[0]);
    await expect
      .poll(() => page.evaluate(savedSceneRecords))
      .toContainEqual(
        expect.objectContaining({
          project: expect.objectContaining({
            skills: [expect.objectContaining({ hash: trained[0], kit: 'velocity-tracking' })],
          }),
        }),
      );
    await page.reload();
    await studioReady(page);
    await expect.poll(() => partCount(page)).toBe(robot.parts.length);
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await expect.poll(() => walkRow(page).innerText()).toMatch(ARENA_LINE);
    expect(await page.evaluate(savedSkills)).toEqual([saved]);
    expect(trained).toHaveLength(1);
    expect(hub.requests.every((request) => !request.auth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await hub.close();
  }
});

it('keeps direct link installation usable when anonymous web discovery is offline', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await exposeTestHooks(page);
    await page.addInitScript(stubTabGpu);
    await page.context().route('https://huggingface.co/**', (route) => route.abort());
    await page.goto(inject('webUrl'));
    await studioReady(page);

    const robot = fixtureRobots().find((candidate) => candidate.id === 'hexapod')!;

    await page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'Offline hexapod',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    });
    await expect.poll(() => partCount(page)).toBe(robot.parts.length);
    await openInstall(page);

    const link = page.getByRole('textbox', { name: 'Skill link' });

    await link.fill('https://huggingface.co/tester/quad-stand');
    await page
      .getByRole('dialog', { name: 'Install Skill' })
      .getByRole('button', { name: 'Install', exact: true })
      .click();
    await page.getByRole('status').filter({ hasText: 'Couldn’t install the skill.' }).waitFor();
    expect(await page.evaluate(savedSkills)).toEqual([]);
  } finally {
    await browser.close();
  }
});
