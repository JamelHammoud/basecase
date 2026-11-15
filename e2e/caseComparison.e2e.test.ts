import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { presetCase } from '../src/cases/caseBuilder';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT, type RobotJoint } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { visible, type StudioHook } from './buildCheckFixtures';
import { openApp, type App } from './harness';

type CaseHook = StudioHook & { addCase: (raw: unknown) => string };

interface ComparisonWindow extends Window {
  __studios: Record<string, CaseHook>;
  __studioTabs: { list: () => { activeId: string }; open: () => void };
}

const rover = fixtureRobots().find((robot) => robot.id === 'rover-diff')!;
const flag = presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts);
const weakJoints = rover.joints.map((joint) => ({ ...joint, effortNm: 0.075 }));

let app: App;

const activeTab = () => app.page.evaluate(() => (window as unknown as ComparisonWindow).__studioTabs.list().activeId);

async function loadRobot(name: string, joints: RobotJoint[]) {
  const tabId = await activeTab();

  await expect
    .poll(() => app.page.evaluate((id) => !!(window as unknown as ComparisonWindow).__studios[id], tabId))
    .toBe(true);
  await app.page.evaluate(
    ({ tabId, record }) => (window as unknown as ComparisonWindow).__studios[tabId].load(record),
    {
      tabId,
      record: { name, parts: rover.parts, project: { ...DEFAULT_PROJECT, joints, cases: [] } },
    },
  );
  await expect
    .poll(() => app.page.evaluate((id) => (window as unknown as ComparisonWindow).__studios[id].sceneRecord(), tabId))
    .toMatchObject({ parts: rover.parts, project: { joints, cases: [] } });

  return tabId;
}

beforeEach(async () => {
  app = await openApp();
});

afterEach(async () => {
  await app?.close();
});

describe('Compare with', () => {
  it('runs the open Case on another tab’s robot and marks the one that passes more often', async () => {
    const first = await loadRobot('Rover', rover.joints);

    await app.page.evaluate(() => (window as unknown as ComparisonWindow).__studioTabs.open());
    await expect.poll(activeTab).not.toBe(first);

    const second = await loadRobot('Weak rover', weakJoints);
    const firstTab = app.page.locator('[role="tab"]:has([data-tab-close])').filter({ hasText: /^Rover$/ });

    await firstTab.click();
    await expect.poll(activeTab).toBe(first);

    const caseId = await app.page.evaluate(
      ({ tabId, raw }) => (window as unknown as ComparisonWindow).__studios[tabId].addCase(raw),
      { tabId: first, raw: flag },
    );

    await expect
      .poll(() =>
        app.page.evaluate((id) => (window as unknown as ComparisonWindow).__studios[id].simState().activeCase, first),
      )
      .toBe(caseId);
    await expect
      .poll(() =>
        app.page.evaluate(
          (id) => (window as unknown as ComparisonWindow).__studios[id].sceneRecord().project.joints,
          second,
        ),
      )
      .toEqual(weakJoints);
    await app.page.keyboard.press('Meta+k');
    await app.page.getByLabel('Search commands').fill('Compare with');
    await expect.poll(() => app.page.getByText(/^Compare with Weak rover/).count(), { timeout: 15000 }).toBe(1);
    await app.page.keyboard.press('Enter');

    const rows = app.page.locator(visible('[data-testid="compare-row"]'));

    await expect.poll(() => rows.count(), { timeout: 150000 }).toBe(2);

    const passes = await rows.locator('[data-testid="compare-passes"]').allInnerTexts();

    expect(passes).toHaveLength(2);
    passes.forEach((text) => expect(text).toMatch(/^\d+ of 20$/));
    expect(Number.parseInt(passes[0])).toBeGreaterThan(Number.parseInt(passes[1]));
    expect(await rows.nth(0).getAttribute('data-better')).toBe('true');
    expect(await rows.nth(1).getAttribute('data-better')).toBe('false');
    expect(await rows.nth(1).innerText()).toContain('Weak rover');
    expect(app.errors).toEqual([]);
  }, 240000);
});
