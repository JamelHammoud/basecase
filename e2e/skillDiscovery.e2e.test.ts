import { expect, inject, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { fixtureModel } from '../src/skills/fixtureModels';
import { publishedSkillFiles } from '../src/skills/hubSkill';
import { readyStand } from '../src/skills/hubSkillFixtures';
import { produceInstallOutcome } from '../src/skills/installOutcome';
import { kitEnvironment } from '../src/skills/kitEnvironment';
import { kitJob } from '../src/skills/kitJob';
import { robotSchema } from '../src/skills/robotSchema';
import { rankSkills, type RankedSkill } from '../src/skills/skillRank';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { commitSha, startFakeHub } from './fakeHub';
import { openApp, partCount, shown, type App } from './harness';
import { holdPolicy } from './holdPose';

type Studio = {
  load: (r: unknown) => void;
  stubTrainer: (policy: unknown) => void;
  publishedSkills: () => RankedSkill[];
};

async function openQuad(app: App) {
  const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: 'Quad',
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
  await app.page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
}

async function openInstall(app: App) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Install Skill');
  await app.page.locator(shown('button[data-idx="0"]'), { hasText: 'Install Skill' }).click();
}

it('ranks published skills for the open quad and starts installation from the selected commit', async () => {
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
      revision: commitSha(repo, 1),
      files: Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, new TextDecoder().decode(bytes)])),
    };
  });
  const app = await openApp({ 'train-status': { uv: true, ready: true, running: [] } }, ['hub-']);

  try {
    const model = fixtureModel('quad-servo');

    await openQuad(app);
    await app.page.evaluate(
      (policy) => (window as unknown as { __studio: Studio }).__studio.stubTrainer(policy),
      holdPolicy(kitJob(model, 'stand', { minutes: 1, seed: 0 })),
    );
    await openInstall(app);

    const rows = app.page.getByTestId('published-skill');
    const ranked = rankSkills(candidates, robotSchema(model));
    const expected = ranked.map((r) => r.repo);
    const listed = () =>
      app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.publishedSkills());

    await expect.poll(async () => (await listed()).map((r) => r.repo)).toEqual(expected);
    expect(await rows.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-repo')))).toEqual(expected);
    expect((await listed()).at(-1)?.fit.ok).toBe(false);
    expect(await rows.last().getByRole('button', { name: 'Install', exact: true }).isDisabled()).toBe(true);

    const selected = ranked[0];
    const requestedBeforeInstall = hub.requests.length;

    hub.seed(selected.repo, {}, 'model');

    await rows.first().getByRole('button', { name: 'Install', exact: true }).click();

    const outcome = app.page.getByRole('status').filter({ hasText: /Training Stand from|Couldn’t install the skill/ });

    await outcome.waitFor();
    expect(await outcome.innerText()).toBe(`Training Stand from ${selected.repo}`);

    const downloaded = hub.requests.slice(requestedBeforeInstall).map((r) => r.path);
    const files = ['skill.json', 'policy.json', 'contract.json', 'environment.json', 'evidence.json', 'robot.json'];

    expect(downloaded).toEqual(files.map((file) => `/${selected.repo}/resolve/${selected.revision}/${file}`));
    expect(await app.page.getByRole('dialog', { name: 'Install Skill' }).count()).toBe(0);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
    await hub.close();
  }
});

it('keeps the skill link field usable from Train when Hub discovery is offline', async () => {
  const hub = await startFakeHub({ token: 'test', port: inject('hubPort') });
  const app = await openApp({}, ['hub-']);

  try {
    await openQuad(app);
    await hub.close();

    const discovery = app.page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/hub-find-skills'),
    );

    await app.page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Stand' }).first().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Install Skill', exact: true }).click();
    expect(await (await discovery).json()).toEqual([]);
    expect(await app.page.getByTestId('published-skill').count()).toBe(0);

    const link = app.page.getByRole('textbox', { name: 'Skill link' });

    await link.fill('https://huggingface.co/tester/quad-servo-stand');
    expect(await link.inputValue()).toBe('https://huggingface.co/tester/quad-servo-stand');
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

it('reorders discovery after reported installs on a second robot', async () => {
  const hub = await startFakeHub({ token: 'test', port: inject('hubPort') });
  const sourceModel = fixtureModel('quad-servo');
  const targetModel = fixtureModel('hexapod');
  const skill = readyStand(sourceModel, 'source');
  const targetSkill = readyStand(targetModel, 'installed');
  const environment = kitEnvironment(targetModel, 'stand');
  const candidates = ['a-stand', 'z-stand'].map((name) => {
    const repo = `tester/${name}`;

    hub.seed(
      repo,
      publishedSkillFiles({ skill, environment: kitEnvironment(sourceModel, 'stand'), model: sourceModel }),
      'model',
    );

    return { repo, revision: commitSha(repo, 1), skill, schema: robotSchema(sourceModel) };
  });
  const app = await openApp({}, ['hub-']);

  try {
    await openQuad(app);
    await openInstall(app);

    const repos = () =>
      app.page.getByTestId('published-skill').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-repo')));

    await expect.poll(repos).toEqual(candidates.map((candidate) => candidate.repo));
    await app.page.keyboard.press('Escape');

    for (const [index, source] of candidates.entries()) {
      const evidence = structuredClone(targetSkill.evidence!);

      evidence.passed = index === 1;
      evidence.variants.forEach((variant) => {
        variant.passes = index === 1 ? 32 : 0;
      });

      const record = produceInstallOutcome({
        source,
        model: targetModel,
        environment,
        status: index === 1 ? 'passed' : 'failed',
        evidence,
      });
      const encode = (value: string) => new TextEncoder().encode(value);

      hub.seed(
        `installer/outcome-${index}`,
        {
          'README.md': encode('---\nlibrary_name: basecase\ntags:\n- basecase-skill-outcome\n---\n'),
          'outcome.json': encode(JSON.stringify(record)),
        },
        'model',
      );
    }

    await openInstall(app);
    await expect.poll(repos).toEqual([...candidates].reverse().map((candidate) => candidate.repo));
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
    await hub.close();
  }
});
