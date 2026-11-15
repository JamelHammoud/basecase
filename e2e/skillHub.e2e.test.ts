import { expect, inject, it } from 'vitest';
import type { SimModel } from '../src/sim/mjcfTypes';
import { readyStand } from '../src/skills/hubSkillFixtures';
import { skillRecord, type SkillRecord } from '../src/skills/skillRecords';
import { designOf } from '../src/skills/skillsRuntime';
import { loadFixtureRobot } from './driveChecks';
import { startFakeHub } from './fakeHub';
import { openApp, shown, type App } from './harness';

const HUB_TOKEN = 'hf_e2eFakeHubToken';

type Studio = {
  fleetModel: () => Promise<SimModel>;
  seedFleetSkill: (record: SkillRecord) => Promise<void>;
};

const standRow = (app: App) => app.page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

async function publishFromMenu(app: App) {
  const publish = app.page.getByRole('menuitem', { name: 'Publish to Hugging Face', exact: true });
  const token = app.page.locator(shown('input[aria-label="Access token"]'));
  const toast = (text: RegExp) => app.page.getByRole('status').filter({ hasText: text });
  const outcome = toast(/Published to|Couldn’t publish/);

  await standRow(app).click({ button: 'right' });
  await publish.click();
  await token
    .or(toast(/Publishing skill/))
    .or(outcome)
    .first()
    .waitFor();

  if (await token.isVisible()) {
    await token.fill(HUB_TOKEN);
    await token.press('Enter');
    await expect
      .poll(() => app.page.locator(shown('[role=dialog][aria-label=Settings]')).innerText())
      .toContain('tester');
    await app.page.keyboard.press('Escape');
    await standRow(app).click({ button: 'right' });
    await publish.click();
  }

  await outcome.first().waitFor();

  return outcome.first().innerText();
}

it('publishes a saved ready Stand from its row without training', async () => {
  const hub = await startFakeHub({ token: HUB_TOKEN, port: inject('hubPort') });
  const app = await openApp({ 'train-status': { uv: true, ready: true, running: [] } }, ['hub-']);

  try {
    await loadFixtureRobot(app.page, 'quad-servo');
    await app.page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();

    const model = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.fleetModel());
    const skill = readyStand(model, designOf(model));
    const record = skillRecord(skill, { kit: 'stand' });

    await app.page.route(
      (url) => url.pathname === '/api/bridge/skill',
      (route) =>
        route.fulfill({
          json: new URL(route.request().url()).searchParams.get('hash') === record.hash ? skill : null,
        }),
    );
    await app.page.evaluate(
      (saved) => (window as unknown as { __studio: Studio }).__studio.seedFleetSkill(saved),
      record,
    );
    await expect.poll(() => standRow(app).innerText()).toContain('of 32 tries');

    const said = await publishFromMenu(app);
    const repo = /Published to (\S+)/.exec(said)?.[1] ?? '';
    const published = hub.repos.get(repo);

    expect(repo).toMatch(/^tester\/.+-stand-[0-9a-f]{6}$/);
    expect(published?.kind).toBe('model');
    expect([...(published?.files.keys() ?? [])]).toEqual(
      expect.arrayContaining([
        'README.md',
        'skill.json',
        'policy.json',
        'policy.onnx',
        'contract.json',
        'environment.json',
        'evidence.json',
        'robot.json',
      ]),
    );
    expect(JSON.parse(published!.files.get('skill.json')!.toString())).toEqual(skill);
    expect(JSON.stringify(app.posts)).not.toContain(HUB_TOKEN);
    expect(JSON.stringify(await app.page.evaluate(() => localStorage))).not.toContain(HUB_TOKEN);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
    await hub.close();
  }
});
