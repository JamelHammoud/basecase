import { expect, it } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

type Studio = {
  load: (record: unknown) => void;
  sceneRecord: () => unknown;
  simState: () => { activeCase: string | null; timeline: { seed: number } | null };
  caseTrails: () => Array<{ seed: number; passed: boolean; points: Array<{ x: number; y: number; visible: boolean }> }>;
};

const studio = <T>(app: App, run: (s: Studio) => T) =>
  app.page.evaluate(`(${run.toString()})(window.__studio)`) as Promise<Awaited<T>>;

it('fails one knee in the quadruped’s Walk Without Falling Case, opens the failing seed and keeps the fault when reopened', async () => {
  const app = await openApp();

  try {
    const quad = fixtureRobots().find((r) => r.id === 'quad-servo')!;
    const made = buildCase(
      { goal: 'walk', world: 'floor' },
      builderRobot(buildRig(quad.joints, quad.parts), quad.parts),
    );

    if (!made.ok) throw new Error(made.problem);

    const kase = made.kase;
    const listed = app.page.locator(shown('[data-testid="case-fault"]'));
    const item = (name: string) => app.page.locator(shown('[role=menuitem]'), { hasText: new RegExp(`^${name}$`) });

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: quad.id,
      parts: quad.parts,
      project: { ...DEFAULT_PROJECT, joints: quad.joints, cases: [kase] },
    });
    await expect.poll(() => partCount(app.page)).toBe(quad.parts.length);
    await openPlayTab(app.page, 'Cases');
    await app.page.locator(shown('[data-testid="cases-panel"] button'), { hasText: kase.name }).first().click();
    await expect.poll(() => studio(app, (s) => s.simState().activeCase)).toBe(kase.id);

    await app.page.locator(shown('[data-testid="add-fault"]')).click();
    await item('leg0_bend').hover();
    await item('Limp').click();
    await expect.poll(() => listed.textContent()).toMatch(/Limp leg0_bend/);

    await app.page.locator('[role=tab]:not([inert] *):visible', { hasText: 'Build' }).first().click();

    const row = app.page.locator(shown('[data-testid="case-fault-check"]'));

    await expect.poll(() => row.textContent(), { timeout: 120000 }).toMatch(/of 20$/);
    await expect.poll(() => row.getAttribute('data-status')).toBe('fail');
    await expect
      .poll(() => app.page.locator(shown('#case-check-walk-without-falling')).getAttribute('data-status'))
      .not.toBe('fail');

    await row.click();
    await expect.poll(async () => (await studio(app, (s) => s.caseTrails())).length, { timeout: 60000 }).toBe(20);

    const failed = (await studio(app, (s) => s.caseTrails())).find(
      (t) => !t.passed && t.points.some((p) => p.visible),
    )!;
    const point = failed.points.findLast((p) => p.visible)!;

    await app.page.mouse.click(point.x, point.y);
    await expect.poll(() => studio(app, (s) => s.simState().timeline?.seed)).toBe(failed.seed);
    await app.page.keyboard.press('Escape');

    const saved = JSON.parse(JSON.stringify(await studio(app, (s) => s.sceneRecord())));

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), saved);
    await expect.poll(() => partCount(app.page)).toBe(quad.parts.length);
    await openPlayTab(app.page, 'Cases');
    await app.page.locator(shown('[data-testid="cases-panel"] button'), { hasText: kase.name }).first().click();
    await expect.poll(() => listed.textContent()).toMatch(/Limp leg0_bend/);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
}, 300000);
