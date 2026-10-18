import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';

const LISTS: Record<string, unknown> = {
  scenes: [],
  models: [],
  images: [],
  chats: [],
  purchases: {},
  'acp-status': { connected: false },
  'train-status': { uv: false, ready: false, running: [] },
};

export interface App {
  page: Page;
  errors: string[];
  close: () => Promise<void>;
}

async function stubBackend(page: Page): Promise<void> {
  await page.route('**/api/events', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }),
  );
  await page.route('**/api/bridge/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LISTS[name] ?? {}) });
  });
}

const startServer = async (): Promise<ViteDevServer> => {
  const server = await createServer({ configFile: 'vite.config.ts', server: { port: 0 }, logLevel: 'silent' });

  return server.listen();
};

export async function openApp(): Promise<App> {
  const server = await startServer();
  const browser: Browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];

  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await stubBackend(page);
  await page.goto(server.resolvedUrls!.local[0]);
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
    timeout: 60000,
  });

  return {
    page,
    errors,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}

export const partCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __studio: { parts: () => unknown[] } }).__studio.parts().length);
