import { expect, inject, it } from 'vitest';
import { skillHash } from '../src/skills/artifacts';
import { fixtureModel } from '../src/skills/fixtureModels';
import { publishedSkillFiles } from '../src/skills/hubSkill';
import { kitEnvironment } from '../src/skills/kitEnvironment';
import type { ProjectSettings } from '../src/types/robotics';
import { exposeTestHooks, launchChrome } from './harness';
import { ARENA_LINE, stubHoldPose, stubTabGpu } from './holdPose';
import { stubWebSkillHub } from './webSkillHub';
import { readyKit, stubWebTrainWorker, type KitJob } from './webTrainWorker';

it('installs Stand on the gallery hexapod, tries its policy and carries the result through Open Scene', async () => {
  const browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const hub = await stubWebSkillHub(page);
  const model = fixtureModel('quad-servo');
  const source = readyKit({ model, design: 'published-quad', entry: 'stand' });
  const jobs: KitJob[] = [];
  const errors: string[] = [];

  hub.seed(
    'tester/quad-stand',
    publishedSkillFiles({ skill: source, environment: kitEnvironment(model, 'stand'), model }),
    'model',
  );
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    const trained = await stubWebTrainWorker(page, jobs);

    await exposeTestHooks(page);
    await page.addInitScript(stubTabGpu);
    await page.goto(`${inject('webUrl')}/c/hexapod-reach-the-flag`);
    await page.waitForFunction(() => Boolean((window as unknown as { __gallery?: unknown }).__gallery));
    await page.evaluate(stubHoldPose, '__gallery' as const);
    await page.getByTestId('gallery-card').getByRole('button', { name: 'Install Skill', exact: true }).click();

    const result = page.getByTestId('published-skill');

    await expect.poll(() => result.getAttribute('data-repo')).toBe('tester/quad-stand');
    await result.getByRole('button', { name: 'Install', exact: true }).click();

    const row = page.getByTestId('gallery-card').getByTestId('skill-row');

    await expect.poll(() => row.innerText()).toMatch(ARENA_LINE);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ entry: 'stand', warm: { from: skillHash(source) } });
    await row.getByRole('button', { name: 'Try', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as {
              __gallery: { state: () => { controller: string; skill: { hash: string } } };
            }
          ).__gallery.state(),
        ),
      )
      .toMatchObject({ controller: 'policy', skill: { hash: trained[0] } });
    await page.getByRole('button', { name: 'Open Scene', exact: true }).click();
    await page.waitForURL(`${inject('webUrl')}/`);
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as {
              __studio: { sceneRecord: () => { project: ProjectSettings } };
            }
          ).__studio.sceneRecord(),
        ),
      )
      .toMatchObject({ project: { skills: [expect.objectContaining({ hash: trained[0], kit: 'stand' })] } });
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await hub.close();
  }
});
