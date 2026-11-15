import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { presetCase } from '../src/cases/caseBuilder';
import { robotFacts, slotRefusal } from '../src/cases/robotFit';
import { caseSlots } from '../src/cases/schema';
import { L_BRACKET_NAME, lBracketScene } from '../src/strength/fixtures/lBracket';
import type { WalkSim } from '../src/utils/engineeringTypes';
import { buildRig } from '../src/utils/kinematics';
import { so101 } from '../src/wiring/fixtures';
import {
  armWithEstimates,
  bomRow,
  buildCheckPage,
  loadKnees,
  servo,
  storeWalk,
  visible,
  type StudioHook,
} from './buildCheckFixtures';
import { agentRequest, kneeLink, loadFallBiped, openedItem, selection } from './fallsFixtures';
import { openApp, partCount, type App } from './harness';

let app: App;

const { checks, checkRow, section, headerText, buildTabDot, expand, addCube, loadParts, loadStandIns } = buildCheckPage(
  () => app.page,
);

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Checks', () => {
  it('run on their own and lead the Build tab with a live verdict', async () => {
    await addCube();
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await expect.poll(() => checks().isVisible(), { timeout: 20000 }).toBe(true);
    await expect.poll(headerText, { timeout: 45000 }).toMatch(/Ready to build|\d+ to fix/);
    expect(await checks().textContent()).toContain('Parts attached');
    expect(await buildTabDot().count()).toBe(/Ready to build/.test(await headerText()) ? 0 : 1);

    const leads = await checks().evaluate(
      (section) => section.parentElement?.querySelector(':scope > section') === section,
    );

    expect(leads).toBe(true);
  }, 90000);

  const quotes = () => app.page.locator(visible('[role=group][aria-label=Quotes]'));
  const quoteProblem = async () => {
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await checks().locator('[data-finding]').first().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Quote' }).click();
    await expect.poll(() => quotes().count(), { timeout: 10000 }).toBe(1);
  };
  const promptContaining = (text: string) =>
    JSON.stringify(app.posts.find((p) => JSON.stringify(p.body).includes(text))?.body ?? '');

  it('let you ignore a blocker for the whole project, restore it, and send it to the agent with Fix', async () => {
    await loadStandIns();
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await expect.poll(headerText, { timeout: 45000 }).toMatch(/[1-9]\d* to fix/);
    await expect
      .poll(() => buildTabDot().getAttribute('aria-label'))
      .toBe((await headerText()).match(/\d+ to fix/)?.[0]);
    expect(await checks().getByRole('button', { name: 'Fix' }).count()).toBe(0);
    await checks()
      .getByRole('button', { name: /^Real parts/ })
      .click();
    await expect
      .poll(() => checks().getByRole('button', { name: 'Fix' }).count(), { timeout: 45000 })
      .toBeGreaterThan(0);

    const fixes = await checks().getByRole('button', { name: 'Fix' }).count();

    await checks().locator('[data-finding]').first().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: /^Ignore All / }).click();
    await expect
      .poll(() => checks().getByRole('button', { name: 'Fix' }).count(), { timeout: 45000 })
      .toBeLessThan(fixes);

    await checks()
      .getByRole('button', { name: /^Ignored/ })
      .first()
      .click();
    await checks().getByRole('button', { name: 'Restore' }).first().click();
    await expect.poll(() => checks().getByRole('button', { name: 'Fix' }).count(), { timeout: 45000 }).toBe(fixes);
    await checks().getByRole('button', { name: 'Fix' }).first().click();

    const prompt = () => promptContaining('Quoted from Checks');

    await expect.poll(prompt, { timeout: 15000 }).toContain('Fix this.');
    expect(prompt()).toContain('dispute_finding');
  }, 120000);

  it('send a quote with the message and show it above the text in the chat', async () => {
    await quoteProblem();

    const quoted = (await quotes().locator('p').first().textContent()) ?? '';
    const box = app.page.locator(visible('textarea')).last();

    await box.fill('Is this safe to ignore?');
    await box.press('Enter');

    const prompt = () => promptContaining('Is this safe to ignore?');

    await expect.poll(prompt, { timeout: 15000 }).toContain('Quoted from Checks');
    expect(prompt()).toContain(quoted);
    expect(await box.inputValue()).toBe('');
    await expect.poll(() => quotes().count(), { timeout: 5000 }).toBe(0);

    const exactly = new RegExp(`^\\s*${quoted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

    await expect
      .poll(() => app.page.locator(visible('p')).filter({ hasText: exactly }).count(), { timeout: 5000 })
      .toBeGreaterThan(0);
  }, 30000);

  it('say which joints the simulation estimates, and select their parts', async () => {
    await app.page.evaluate(
      (record) => (window as unknown as { __studio: StudioHook }).__studio.load(record),
      armWithEstimates(),
    );
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

    const estimates = checks().getByRole('button', { name: /^Torque estimates/ });

    await expect.poll(() => estimates.count(), { timeout: 45000 }).toBe(1);
    await estimates.click();
    await expect
      .poll(() => checks().innerText(), { timeout: 45000 })
      .toContain('These joints have no servo, so the simulation guesses their torque from weight.');
    expect(await checks().innerText()).toContain('No servo on Arm0');
    expect(await checks().innerText()).not.toContain('without a servo');
    await checks().getByRole('button', { name: 'link0', exact: true }).first().click();

    const models = checks().getByRole('button', { name: /^Servo models/ });

    await models.click();
    await expect
      .poll(() => checks().innerText(), { timeout: 45000 })
      .toContain('These servos aren’t calibrated on this robot.');
    expect(await checks().innerText()).toContain('MG996R on Arm1');
    expect(app.errors).toEqual([]);
  }, 90000);
});

describe('Build tab fields', () => {
  it('set the tether in the power check that reads it', async () => {
    await loadParts([servo]);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

    const row = checks()
      .locator('li')
      .filter({ has: app.page.getByRole('button', { name: /^Servo voltage/ }) })
      .first();

    await expect.poll(() => row.isVisible(), { timeout: 45000 }).toBe(true);
    await row.getByRole('button', { name: /^Servo voltage/ }).click();

    const volts = row.getByRole('textbox', { name: 'Supply voltage' });

    await volts.fill('24');
    await volts.press('Enter');
    await expect.poll(async () => (await row.textContent()) ?? '', { timeout: 45000 }).toMatch(/24 V.*maximum/);
    expect(await row.locator('svg.text-red-400').count()).toBeGreaterThan(0);
  }, 90000);

  it('read current and runtime from a stored walk, naming the hungriest joint', async () => {
    const walk: WalkSim = {
      policy: 'Walk',
      seconds: 14,
      fellAt: null,
      joints: {},
      power: { avgA: 1.6, peakA: 3.4, joints: { ja: { avgA: 1, peakA: 2 }, jb: { avgA: 0.6, peakA: 1.4 } } },
    };
    const row = checkRow('Current and runtime');
    const detail = async () => {
      await expand(row, 'Current and runtime');

      return (await row.locator('p').first().textContent()) ?? '';
    };

    await loadKnees(app.page);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await expect.poll(() => row.isVisible(), { timeout: 45000 }).toBe(true);
    await expect.poll(detail, { timeout: 45000 }).toContain('(estimate)');

    const estimate = await detail();

    await storeWalk(app.page, walk);
    await expect.poll(detail, { timeout: 45000 }).not.toBe(estimate);
    expect(await detail()).toMatch(/A average walking .*Left knee: 1 A average/);
  }, 120000);

  it('plot each knee’s walk on its servo’s torque–speed line under Peak torque', async () => {
    const samples = (rpm: number): Array<[number, number]> =>
      Array.from({ length: 40 }, (_, i) => (i % 2 ? [rpm, 1.1] : [-5, 0.3]));
    const walk: WalkSim = {
      policy: 'Walk',
      seconds: 14,
      fellAt: null,
      joints: {
        ja: { p99Nm: 1.1, rmsNm: 0.5, overS: 0, samples: samples(40) },
        jb: { p99Nm: 1.1, rmsNm: 0.5, overS: 0, samples: samples(5) },
      },
    };
    const row = checkRow('Peak torque');
    const plot = (joint: string) => row.locator(`[data-joint="${joint}"]`);

    await loadKnees(app.page);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await storeWalk(app.page, walk);
    await expect.poll(() => row.isVisible(), { timeout: 45000 }).toBe(true);
    await expect
      .poll(
        async () => {
          await expand(row, 'Peak torque');

          return plot('ja').isVisible();
        },
        { timeout: 45000 },
      )
      .toBe(true);

    const note = row.locator('li', { has: app.page.locator('[data-joint="ja"]') });

    expect(await note.textContent()).toMatch(/Left knee: .*% of the walk past its torque–speed line/);

    for (const id of ['driving', 'braking', 'servo', 'up'])
      expect(await plot('ja').locator(`[data-testid="trace-${id}"]`).count()).toBe(1);

    expect(await plot('ja').textContent()).toMatch(/N·m.*rpm.*Servo a/);
    expect(await plot('jb').count()).toBe(0);

    await row.getByRole('button', { name: /^Right knee/ }).click();
    await expect.poll(() => plot('jb').isVisible()).toBe(true);
  }, 120000);

  it('fail Falls at the long-legged biped’s knee, and select the knee’s link from its item', async () => {
    const row = checkRow('Falls');
    const kneeItem = row.locator('li', { hasText: /knee: \d+\.\d× rated, falling / }).first();
    const biped = await loadFallBiped(app.page);

    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await agentRequest(app.page, 'verify', { falls: true });
    await expect.poll(() => openedItem(row, 'Falls', kneeItem), { timeout: 60000 }).toBe(true);

    const text = (await kneeItem.textContent()) ?? '';

    expect(text).toMatch(/strip its gears/);
    await kneeItem.getByRole('button', { name: 'Replay in Sim' }).click();
    await expect.poll(() => selection(app.page), { timeout: 10000 }).toEqual(kneeLink(biped, text));
  }, 120000);

  it('set a budget beside the bill of materials total', async () => {
    const bom = section(/^Bill of materials/);
    const budget = bom.getByRole('textbox', { name: /^Budget in / });

    await loadKnees(app.page);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await expect.poll(() => budget.isVisible(), { timeout: 15000 }).toBe(true);
    await budget.fill('100000');
    await budget.press('Enter');
    await expect.poll(async () => (await bom.textContent()) ?? '', { timeout: 10000 }).toMatch(/ left/);
  }, 30000);
});

describe('Cables', () => {
  it('list one 5264 cable per hop of an SO-101 arm, with no generic pack', async () => {
    const cables = await bomRow(app.page, so101(), 'Bus Servo Cable');

    await expect.poll(() => cables.count(), { timeout: 20000 }).toBe(1);
    expect(await cables.first().innerText()).toMatch(/^6×/);
  }, 90000);
});

describe('Cases in Checks', () => {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const flag = presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts);
  const activeCase = () =>
    app.page.evaluate(() => (window as unknown as { __studio: StudioHook }).__studio.simState().activeCase);

  it('puts /pass and the open Case in the composer from ⌘K when its row fails', async () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
    const focusedValue = () =>
      app.page.evaluate(() => {
        const el = document.activeElement;

        return el instanceof HTMLTextAreaElement ? el.value : el?.tagName;
      });

    await app.page.evaluate(
      ({ parts, joints, kase }) => {
        const studio = (window as unknown as { __studio: StudioHook }).__studio;

        studio.load({ parts, project: { ...studio.sceneRecord().project, joints, cases: [kase] } });
      },
      { parts: arm.parts, joints: arm.joints, kase: flag },
    );
    await expect.poll(() => partCount(app.page)).toBe(arm.parts.length);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

    const row = checks().getByRole('button', { name: /^Reach a Spot/ });

    await expect.poll(() => row.count(), { timeout: 90000 }).toBe(1);
    await expect.poll(() => row.getAttribute('data-status'), { timeout: 90000 }).toBe('fail');
    await row.click();
    await expect.poll(activeCase, { timeout: 10000 }).toBe('reach-a-spot');

    await app.page.keyboard.press('Meta+k');
    await expect.poll(() => app.page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT');
    await app.page.keyboard.type('Make It Pass');
    await app.page.keyboard.press('Enter');
    await expect.poll(focusedValue).toBe('/pass Reach a Spot');
    await app.page.locator(visible('textarea')).last().fill('');
    expect(app.errors).toEqual([]);
  }, 150000);

  it('names why the robot doesn’t fit on the row and the Case header, and offers New Case', async () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
    const reason = slotRefusal(caseSlots(flag)[0], robotFacts(buildRig(arm.joints, arm.parts), arm.parts))!;

    await app.page.evaluate(
      ({ parts, joints, kase }) => {
        const studio = (window as unknown as { __studio: StudioHook }).__studio;

        studio.load({ parts, project: { ...studio.sceneRecord().project, joints, cases: [kase] } });
      },
      { parts: arm.parts, joints: arm.joints, kase: flag },
    );
    await expect.poll(() => partCount(app.page)).toBe(arm.parts.length);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

    const row = checks().getByRole('button', { name: /^Reach a Spot/ });
    const entry = checks()
      .locator('li')
      .filter({ has: app.page.getByRole('button', { name: /^Reach a Spot/ }) })
      .first();

    await expect.poll(() => row.getAttribute('data-status'), { timeout: 90000 }).toBe('fail');
    await expect.poll(() => entry.innerText(), { timeout: 10000 }).toContain(reason);

    await row.click();
    await expect.poll(activeCase, { timeout: 10000 }).toBe('reach-a-spot');

    const header = app.page.locator(visible('[data-testid="case-check"]'));

    expect(await app.page.locator(visible('button'), { hasText: 'Check Fit' }).count()).toBe(0);
    await expect.poll(() => header.getAttribute('data-status'), { timeout: 10000 }).toBe('fail');
    expect(await header.getAttribute('aria-label')).toBe(reason);

    await header.click();
    await expect.poll(() => app.page.evaluate(() => document.activeElement?.id ?? '')).toBe('case-check-reach-a-spot');

    const note = entry.locator('ul > li').filter({ hasText: reason }).first();

    await note.hover();
    await note.getByRole('button', { name: 'New Case' }).click();
    await expect.poll(() => app.page.locator(visible('[data-testid="new-case"]')).count(), { timeout: 10000 }).toBe(1);
    await app.page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  }, 150000);
});

describe('Strength', () => {
  it('fails an L-bracket printed with its layers across the bend, and Fix turns it on its side', async () => {
    const scene = lBracketScene();

    await app.page.evaluate((record) => {
      const studio = (window as unknown as { __studio: StudioHook }).__studio;

      studio.load({ parts: record.parts, project: { ...(studio.sceneRecord().project as object), ...record.project } });
    }, scene);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

    const row = checks()
      .locator('li')
      .filter({ has: app.page.getByRole('button', { name: /^Strength/ }) })
      .first();

    await expect.poll(() => row.locator('svg.text-red-400').count(), { timeout: 90000 }).toBeGreaterThan(0);
    await row.getByRole('button', { name: /^Strength/ }).click();
    expect(await row.textContent()).toContain(L_BRACKET_NAME);

    await row.getByRole('button', { name: 'Fix' }).first().click();
    await expect.poll(() => row.locator('svg.text-emerald-400').count(), { timeout: 90000 }).toBeGreaterThan(0);
    expect(await row.locator('svg.text-red-400').count()).toBe(0);
  }, 200000);
});
