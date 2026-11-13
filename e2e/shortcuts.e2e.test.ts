import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCULPT_ROWS, SHORTCUT_GROUPS } from '../src/components/shortcutGroups';
import { openApp, partCount, shown, type App } from './harness';

interface Studio {
  load: (record: { parts: unknown[] }) => void;
  select: (ids: string[]) => void;
  selection: () => string[];
}

let app: App;

const box = (id: string, x: number) => ({
  id,
  name: id,
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [x, 10, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 20, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

const select = (ids: string[]) =>
  app.page.evaluate((list) => (window as unknown as { __studio: Studio }).__studio.select(list), ids);

const selection = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.selection().length);

const tabCount = () => app.page.locator(shown('[role="tab"]:has([data-tab-close])')).count();

const paneLabels = () =>
  app.page.getByRole('dialog', { name: 'Settings' }).locator('span.min-w-0.truncate').allTextContents();

beforeAll(async () => {
  app = await openApp();
  await app.page.evaluate(
    (parts) => (window as unknown as { __studio: Studio }).__studio.load({ parts }),
    [box('left', -30), box('right', 30)],
  );
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('keyboard shortcuts', () => {
  it('opens the Shortcuts pane on ? and lists only keys that do something', async () => {
    await app.page.keyboard.press('Shift+Slash');
    await expect.poll(() => paneLabels().then((labels) => labels.length)).toBeGreaterThan(0);

    const labels = await paneLabels();
    const everywhere = SHORTCUT_GROUPS.filter((g) => !g.desktopOnly)
      .flatMap((g) => g.rows.map(([label]) => label))
      .filter((label) => !SCULPT_ROWS.has(label));

    expect(labels).toEqual(expect.arrayContaining(everywhere));
    expect(labels.filter((label) => /^Save\b/.test(label))).toEqual([]);

    await app.page.keyboard.press('Escape');
    await expect.poll(() => app.page.getByRole('dialog', { name: 'Settings' }).count()).toBe(0);
  });

  it('runs the edit keys the pane lists', async () => {
    await app.page.keyboard.press('ControlOrMeta+a');
    await expect.poll(selection).toBe(2);

    await app.page.keyboard.press('Escape');
    await expect.poll(selection).toBe(0);

    await select(['left']);
    await app.page.keyboard.press('ControlOrMeta+d');
    await expect.poll(() => partCount(app.page)).toBe(3);

    await app.page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => partCount(app.page)).toBe(2);

    await app.page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(() => partCount(app.page)).toBe(3);

    await select(['left']);
    await app.page.keyboard.press('Backspace');
    await expect.poll(() => partCount(app.page)).toBe(2);
  });

  it('runs the scene keys the pane lists', async () => {
    const before = await tabCount();

    await app.page.keyboard.press('ControlOrMeta+t');
    await expect.poll(tabCount).toBe(before + 1);

    await app.page.keyboard.press('ControlOrMeta+1');
    await expect.poll(() => partCount(app.page)).toBe(2);

    await app.page.keyboard.press('ControlOrMeta+9');
    await expect.poll(() => partCount(app.page)).toBe(0);

    await app.page.keyboard.press('ControlOrMeta+w');
    await expect.poll(tabCount).toBe(before);
    expect(app.errors).toEqual([]);
  });
});
