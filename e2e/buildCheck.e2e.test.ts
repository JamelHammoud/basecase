import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { caseTemplates } from '../src/cases/templates';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { buildRig } from '../src/utils/kinematics';
import { openApp, partCount, type App } from './harness';

interface StudioHook {
  load: (record: { parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => { project: Record<string, unknown> };
  simState: () => { activeCase: string | null };
}

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const addCube = async () => {
  await app.page.keyboard.press('a');
  await app.page.getByRole('button', { name: /^Cube/ }).first().click();
};

const standIn = (id: string, x: number) => ({
  id,
  name: `Generic servo ${id}`,
  kind: 'servo',
  category: 'actuators',
  role: 'solid',
  position: [x, 20, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 40, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

const loadParts = (parts: unknown[]) =>
  app.page.evaluate((list) => {
    const studio = (window as unknown as { __studio: StudioHook }).__studio;

    studio.load({ parts: list, project: studio.sceneRecord().project });
  }, parts);

const loadStandIns = () => loadParts([standIn('one', -60), standIn('two', 60)]);

const servo = {
  ...standIn('servo', 0),
  name: 'Feetech STS3215',
  kind: 'component',
  componentId: 'feetech-sts3215',
  componentVariant: 'c001',
};

const checks = () => app.page.locator(visible('section'), { hasText: /^Checks/ }).first();

const section = (title: RegExp) => app.page.locator(visible('section'), { hasText: title }).first();

const headerText = async () => (await checks().locator('header').first().textContent()) ?? '';

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

    const leads = await checks().evaluate(
      (section) => section.parentElement?.querySelector(':scope > section') === section,
    );

    expect(leads).toBe(true);
  }, 90000);

  it('let you ignore a blocker for the whole project, and restore it', async () => {
    await loadStandIns();
    await expect.poll(headerText, { timeout: 45000 }).toMatch(/[1-9]\d* to fix/);
    expect(await checks().getByRole('button', { name: 'Fix' }).count()).toBe(0);
    await checks()
      .getByRole('button', { name: /^Real parts/ })
      .click();
    await expect
      .poll(() => checks().getByRole('button', { name: 'Fix' }).count(), { timeout: 45000 })
      .toBeGreaterThan(0);

    const fixes = await checks().getByRole('button', { name: 'Fix' }).count();

    await checks().getByRole('button', { name: 'More' }).first().click();
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
  }, 120000);

  const quotes = () => app.page.locator(visible('[role=group][aria-label=Quotes]'));
  const quoteProblem = async () => {
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await checks().getByRole('button', { name: 'More' }).first().click();
    await app.page.getByRole('menuitem', { name: 'Quote' }).click();
    await expect.poll(() => quotes().count(), { timeout: 10000 }).toBe(1);
  };
  const promptContaining = (text: string) =>
    JSON.stringify(app.posts.find((p) => JSON.stringify(p.body).includes(text))?.body ?? '');

  it('quote a problem above the agent’s message box, then let you remove it', async () => {
    await quoteProblem();

    const box = app.page.locator(visible('textarea')).last();

    expect(await box.inputValue()).toBe('');

    const [quoteBox, composerBox] = await Promise.all([quotes().boundingBox(), box.boundingBox()]);

    expect(quoteBox!.y + quoteBox!.height).toBeLessThanOrEqual(composerBox!.y);

    await quotes().getByRole('button', { name: 'Remove Quote' }).click();
    await expect.poll(() => quotes().count(), { timeout: 5000 }).toBe(0);
  }, 30000);

  it('send a problem to the agent with Fix', async () => {
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();
    await checks().getByRole('button', { name: 'Fix' }).first().click();

    const prompt = () => promptContaining('Fix this problem from Checks');

    await expect.poll(prompt, { timeout: 15000 }).toContain('Fix this problem from Checks');
    expect(prompt()).toContain('dispute_finding');
  }, 30000);

  it('quote a chat message from its right-click menu', async () => {
    const typed = 'Quote this message back';
    const box = app.page.locator(visible('textarea')).last();

    await box.fill(typed);
    await box.press('Enter');
    await app.page.getByText(typed).first().click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Quote Message' }).click();
    await expect.poll(() => quotes().locator('p').first().textContent(), { timeout: 5000 }).toBe(typed);
    await quotes().getByRole('button', { name: 'Remove Quote' }).click();
    await expect.poll(() => quotes().count(), { timeout: 5000 }).toBe(0);
  }, 30000);

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

  it('set a budget beside the bill of materials total', async () => {
    const bom = section(/^Bill of materials/);
    const budget = bom.getByRole('textbox', { name: /^Budget in / });

    await budget.fill('100000');
    await budget.press('Enter');
    await expect.poll(async () => (await bom.textContent()) ?? '', { timeout: 10000 }).toMatch(/ left/);
  }, 30000);
});

describe('Cases in Checks', () => {
  const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
  const flag = caseTemplates(buildRig(rover.joints, rover.parts), rover.parts)
    .find((t) => t.id === 'reach-the-flag')!
    .build();
  const activeCase = () =>
    app.page.evaluate(() => (window as unknown as { __studio: StudioHook }).__studio.simState().activeCase);

  it('judge each Case as a row with its count, and open it in Simulate', async () => {
    await app.page.evaluate(
      ({ parts, joints, kase }) => {
        const studio = (window as unknown as { __studio: StudioHook }).__studio;

        studio.load({ parts, project: { ...studio.sceneRecord().project, joints, cases: [kase] } });
      },
      { parts: rover.parts, joints: rover.joints, kase: flag },
    );
    await expect.poll(() => partCount(app.page)).toBe(rover.parts.length);
    await app.page.locator(visible('[role=tab]'), { hasText: 'Build' }).first().click();

    const row = checks().getByRole('button', { name: /^Reach the Flag/ });

    await expect.poll(() => row.count(), { timeout: 90000 }).toBe(1);
    await expect.poll(async () => (await row.textContent()) ?? '', { timeout: 90000 }).toMatch(/\d+ of 20$/);
    expect(await activeCase()).toBeNull();

    await row.click();
    await expect.poll(activeCase, { timeout: 10000 }).toBe('reach-the-flag');
    await expect
      .poll(() => app.page.locator(visible('[data-testid="case-brief"]')).innerText(), { timeout: 10000 })
      .toContain('Reach the Flag');
    expect(app.errors).toEqual([]);
  }, 150000);
});
