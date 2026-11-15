import { expect, inject, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { fixtureModel } from '../src/skills/fixtureModels';
import { publishedSkillFiles } from '../src/skills/hubSkill';
import { readyStand } from '../src/skills/hubSkillFixtures';
import { kitEnvironment } from '../src/skills/kitEnvironment';
import { kitJob } from '../src/skills/kitJob';
import { robotSchema } from '../src/skills/robotSchema';
import { rankSkills, type RankedSkill } from '../src/skills/skillRank';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { startFakeHub } from './fakeHub';
import { openApp, partCount, shown } from './harness';
import { holdPolicy } from './holdPose';

type Studio = {
  load: (r: unknown) => void;
  stubTrainer: (policy: unknown) => void;
  publishedSkills: () => RankedSkill[];
};

it('lists three published skills for the open quad, installs a row, and keeps the link field usable offline', async () => {
  const hub = await startFakeHub({ token: 'test', port: inject('hubPort') });
  const candidates = ['quad-servo', 'hexapod', 'biped-servo'].map((id) => {
    const model = fixtureModel(id);
    const files = publishedSkillFiles({
      skill: readyStand(model, id),
      environment: kitEnvironment(model, 'stand'),
      model,
    });
    const repo = `tester/${id}-stand`;

    hub.seed(repo, files, 'model');

    return {
      repo,
      revision: '',
      files: Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, new TextDecoder().decode(bytes)])),
    };
  });
  const app = await openApp({ 'train-status': { uv: true, ready: true, running: [] } }, ['hub-']);

  try {
    const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;
    const model = fixtureModel('quad-servo');

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'Quad',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints },
    });
    await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
    await app.page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
    await app.page.evaluate(
      (policy) => (window as unknown as { __studio: Studio }).__studio.stubTrainer(policy),
      holdPolicy(kitJob(model, 'stand', { minutes: 1, seed: 0 })),
    );
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Install Skill');
    await app.page.locator(shown('button[data-idx="0"]'), { hasText: 'Install Skill' }).click();

    const rows = app.page.getByTestId('published-skill');
    const expected = rankSkills(candidates, robotSchema(model)).map((r) => r.repo);
    const listed = () =>
      app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.publishedSkills());

    await expect.poll(async () => (await listed()).map((r) => r.repo)).toEqual(expected);
    expect(await rows.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-repo')))).toEqual(expected);
    expect((await listed()).at(-1)?.fit.ok).toBe(false);
    expect(await rows.last().getByRole('button', { name: 'Install', exact: true }).isDisabled()).toBe(true);

    const saved = app.page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/skill-save'));

    await rows.first().getByRole('button', { name: 'Install', exact: true }).click();
    await saved;

    const stand = app.page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

    await expect.poll(() => stand.getAttribute('data-skill')).toMatch(/^[a-f0-9]{64}$/);
    expect(app.posts.some((p) => p.route === 'skill-save')).toBe(true);
    await hub.close();
    await stand.click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Install Skill', exact: true }).click();
    await expect.poll(() => rows.count()).toBe(0);

    const link = app.page.getByRole('textbox', { name: 'Skill link' });

    await link.fill(`https://huggingface.co/${expected[0]}`);
    expect(await link.inputValue()).toBe(`https://huggingface.co/${expected[0]}`);
    expect(
      await app.page
        .getByRole('dialog', { name: 'Install Skill' })
        .getByRole('button', { name: 'Install', exact: true })
        .isEnabled(),
    ).toBe(true);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
    await hub.close();
  }
});
