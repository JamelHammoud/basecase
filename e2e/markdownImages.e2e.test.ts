import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';
import { LAYOUT } from '../src/design-system/theme';

const remote = 'https://example.com/log?d=scene-evidence';
const destination = 'https://example.com/evidence';
const longUrl = `https://example.com/${'scene-evidence-'.repeat(18)}`;
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
const chat = {
  id: 'image-policy-chat',
  title: 'Image evidence',
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
  messages: [
    {
      id: 'reply',
      role: 'agent',
      timestamp: '2026-11-20T00:00:00.000Z',
      text: `![Remote evidence](${remote})\n\n[![Linked evidence](${remote})](${destination})\n\n![](${longUrl})\n\n![Inline evidence](${png})`,
    },
  ],
};

let app: App;

beforeAll(async () => {
  app = await openApp({ chats: [chat], chat });
});

afterAll(async () => {
  await app?.close();
});

it('opens a saved agent reply without requesting its remote Markdown image', async () => {
  const { page } = app;
  const requests: string[] = [];

  await page.context().route('https://example.com/**', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ body: '' });
  });
  await page.locator(shown('[role=tab]'), { hasText: 'Agent' }).first().click();
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await page.getByRole('menuitem', { name: chat.title, exact: true }).click();

  const divider = page.locator(shown(`[role="separator"][aria-valuemin="${LAYOUT.rightPanelMin}"]`));
  const width = Number(await divider.getAttribute('aria-valuenow'));
  const box = (await divider.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + width - LAYOUT.rightPanelMin, box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(() => divider.getAttribute('aria-valuenow')).toBe(String(LAYOUT.rightPanelMin));

  const link = page.getByRole('link', { name: 'Remote evidence', exact: true });
  const linkedImage = page.getByRole('link', { name: 'Linked evidence', exact: true });
  const fallback = page.getByRole('link', { name: longUrl, exact: true });

  await link.waitFor();
  await fallback.waitFor();
  await page.getByRole('img', { name: 'Inline evidence', exact: true }).waitFor();
  expect(await link.getAttribute('href')).toBe(remote);
  expect(await link.getAttribute('target')).toBe('_blank');
  expect(await linkedImage.getAttribute('href')).toBe(destination);
  expect(await page.locator('a a').count()).toBe(0);
  expect(await page.locator('img[src^="http://"], img[src^="https://example.com/"]').count()).toBe(0);
  expect(requests).toEqual([]);
  expect(app.requests).not.toContain(remote);
  expect(app.requests).not.toContain(longUrl);

  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const textFits = await fallback.evaluate((element) => {
    const markdown = element.closest('div.select-text')!;
    const bounds = markdown.getBoundingClientRect();
    const range = document.createRange();

    return [...markdown.querySelectorAll('a')].every((anchor) => {
      range.selectNodeContents(anchor);

      return [...range.getClientRects()].every((rect) => rect.left >= bounds.left && rect.right <= bounds.right);
    });
  });

  expect(textFits).toBe(true);
  await link.focus();
  await page.keyboard.press('Tab');
  expect(await linkedImage.evaluate((element) => element === document.activeElement)).toBe(true);

  const opened = page.context().waitForEvent('page');

  await linkedImage.press('Enter');

  const browserPage = await opened;

  await expect.poll(() => browserPage.url()).toBe(destination);
  expect(requests).not.toContain(remote);
  expect(requests).not.toContain(longUrl);
  await browserPage.close();
});
