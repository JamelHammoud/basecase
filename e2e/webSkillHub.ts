import type { Page } from 'playwright-core';
import { startFakeHub, type FakeHub } from './fakeHub';

export async function stubWebSkillHub(page: Page): Promise<FakeHub> {
  const hub = await startFakeHub({ token: 'unused' });

  await page.context().route('https://huggingface.co/**', async (route) => {
    const source = new URL(route.request().url());
    const path = source.pathname.replace(
      /^\/api\/resolve-cache\/models\/([^/]+\/[^/]+)\/([^/]+)\/(.+)$/,
      '/$1/resolve/$2/$3',
    );
    const response = await route.fetch({ url: `${hub.url}${path}${source.search}` });

    await route.fulfill({
      response,
      headers: { ...response.headers(), 'Cross-Origin-Resource-Policy': 'cross-origin' },
    });
  });

  return hub;
}
