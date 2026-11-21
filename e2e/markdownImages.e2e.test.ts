import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, shown, type App } from './harness';

const remote = 'https://example.com/log?d=scene-evidence';
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
      text: `![Remote evidence](${remote})\n\n![Inline evidence](${png})`,
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

  await page.route('https://example.com/**', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ body: '' });
  });
  await page.locator(shown('[role=tab]'), { hasText: 'Agent' }).first().click();
  await page.getByRole('tab', { name: 'Agent', exact: true }).click();
  await page.getByRole('menuitem', { name: chat.title, exact: true }).click();

  const link = page.getByRole('link', { name: 'Remote evidence', exact: true });

  await link.waitFor();
  await page.getByRole('img', { name: 'Inline evidence', exact: true }).waitFor();
  expect(await link.getAttribute('href')).toBe(remote);
  expect(await link.getAttribute('target')).toBe('_blank');
  expect(await page.locator('img[src^="http://"], img[src^="https://example.com/"]').count()).toBe(0);
  expect(requests).toEqual([]);
  expect(app.requests).not.toContain(remote);
});
