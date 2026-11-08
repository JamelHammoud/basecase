import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

type Studio = { load: (r: unknown) => void };

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const clickTab = (name: string) => app.page.locator(visible('[role=tab]'), { hasText: name }).first().click();

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

const composer = () => app.page.locator(visible('textarea')).last();

const slashMenu = () => app.page.locator('[data-testid="slash-menu"]');

const focusedValue = () =>
  app.page.evaluate(() => {
    const el = document.activeElement;

    return el instanceof HTMLTextAreaElement ? el.value : el?.tagName;
  });

async function loadFixture(id: string) {
  const robot = fixtureRobots().find((r) => r.id === id)!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('slash commands', () => {
  it('opens on a slash, picks /train with the keyboard and keeps focus', async () => {
    await clickTab('Agent');
    await composer().click();
    await app.page.keyboard.type('/');
    await expect.poll(() => slashMenu().count()).toBe(1);

    const listed = await slashMenu().innerText();

    for (const name of ['/train', '/routine', '/case', '/simulate', '/check']) expect(listed).toContain(name);

    await app.page.keyboard.type('tr');
    await app.page.keyboard.press('Enter');
    await expect.poll(() => composer().inputValue()).toBe('/train ');
    await expect.poll(focusedValue).toBe('/train ');
    expect(await slashMenu().count()).toBe(0);
  });

  it('moves with the arrows, and Esc closes it without touching the text', async () => {
    await composer().fill('');
    await composer().click();
    await app.page.keyboard.type('/');
    await expect.poll(() => slashMenu().count()).toBe(1);
    await app.page.keyboard.press('ArrowDown');
    await app.page.keyboard.press('ArrowDown');
    await app.page.keyboard.press('Enter');
    await expect.poll(() => composer().inputValue()).toBe('/case ');

    await composer().fill('');
    await app.page.keyboard.type('/');
    await expect.poll(() => slashMenu().count()).toBe(1);
    await app.page.keyboard.press('Escape');
    await expect.poll(() => slashMenu().count()).toBe(0);
    expect(await composer().inputValue()).toBe('/');
    await composer().fill('');
  });

  it('puts a command in the composer from ⌘K', async () => {
    await app.page.keyboard.press('Meta+k');
    await expect.poll(() => app.page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT');
    await app.page.keyboard.type('Teach a Skill');
    await app.page.keyboard.press('Enter');
    await expect.poll(focusedValue).toBe('/train ');
    await composer().fill('');
    expect(app.errors).toEqual([]);
  });
});

describe('the Train section', () => {
  it('sends what the user types to the agent as /train, and lists the Motor Kit', async () => {
    await loadFixture('biped-servo');
    await clickTab('Simulate');

    const field = app.page.locator(visible('[data-testid="teach-field"]'));

    await expect.poll(() => field.count()).toBe(1);
    await expect.poll(() => app.page.locator(visible('[data-testid="skill-row"]')).count(), { timeout: 60000 }).toBe(4);
    expect(await app.page.locator(visible('[data-testid="skills-list"]')).innerText()).toContain('Get up');
    await field.fill('wave a front leg');
    await field.press('Enter');

    const prompt = () => app.posts.find((p) => p.route === 'acp-prompt')?.body as { promptText?: string } | undefined;

    await expect.poll(() => prompt()?.promptText ?? '').toContain('/train wave a front leg');
    await expect
      .poll(() => app.page.locator(visible('main, body')).first().innerText())
      .toContain('/train wave a front leg');
    expect(await button(/^Stand$|^Walk$/).count()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});
