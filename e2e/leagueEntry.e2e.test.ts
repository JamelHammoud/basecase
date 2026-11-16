import { expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import type { LeagueManifest } from '../src/leagues/types';
import { hashValue } from '../src/leagues/validation';
import { fixtureRobot } from '../src/skills/fixtureModels';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, openPlayTab, partCount, shown } from './harness';

type Studio = { load: (scene: unknown) => void };

it('opens Enter League through Share Robot and refuses a different pinned Case before entering', async () => {
  const app = await openApp({
    'hub-account': { signedIn: true, name: 'tester' },
    'hub-publish': { repo: 'tester/rover', url: '', revision: 'a'.repeat(40) },
  });
  const rover = fixtureRobot('rover-diff');
  const kase = presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts);
  const pinned = { ...kase, id: 'league-case' };
  const manifest: LeagueManifest = {
    formatVersion: 1,
    id: 'entry-check',
    title: 'Entry check',
    deadline: '2099-01-01T00:00:00.000Z',
    case: pinned,
    caseHash: hashValue(pinned),
    contractHash: hashValue(pinned.task.contract),
    engine: { mujoco: '4.0.0', runner: 'a'.repeat(40) },
    ranking: { score: 'margin', direction: 'higher' },
    seedCount: 2,
  };

  try {
    await app.page.route('**/leagues/entry-check/board.json', (route) =>
      route.fulfill({ json: { manifest, entries: [] } }),
    );
    await app.page.evaluate((scene) => (window as unknown as { __studio: Studio }).__studio.load(scene), {
      name: 'Rover',
      parts: rover.parts,
      project: { ...DEFAULT_PROJECT, joints: rover.joints, cases: [kase] },
    });
    await expect.poll(() => partCount(app.page)).toBe(rover.parts.length);
    await openPlayTab(app.page, 'Cases');
    await app.page.locator(shown('[data-testid="cases-panel"] button'), { hasText: kase.name }).first().click();
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Share Robot');
    await app.page.keyboard.press('Enter');
    await app.page.getByRole('dialog', { name: 'Share Robot', exact: true }).waitFor();
    await app.page.getByRole('textbox', { name: 'League link' }).fill('/l/entry-check');
    await app.page.getByRole('button', { name: 'Enter League', exact: true }).click();
    await expect.poll(() => app.page.getByRole('alert').innerText()).toContain('League Case does not match');

    const published = app.posts.filter((post) => post.route === 'hub-publish');

    expect(published).toHaveLength(1);
    await app.page.keyboard.press('Escape');
    await app.page.keyboard.press('Meta+k');
    await app.page.keyboard.type('Enter League');
    await app.page.keyboard.press('Enter');
    await app.page.getByRole('dialog', { name: 'Share Robot', exact: true }).waitFor();
  } finally {
    await app.close();
  }
});
