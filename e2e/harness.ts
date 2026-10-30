import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';

const EFFORT_LEVELS = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
  { id: 'xhigh', name: 'Extra high' },
  { id: 'max', name: 'Max' },
];

const LISTS: Record<string, unknown> = {
  scenes: [],
  models: [],
  images: [],
  chats: [],
  purchases: {},
  'acp-status': {
    connected: true,
    sessionId: null,
    agentName: 'Claude Code',
    agentCommand: 'node node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js',
    defaultEffort: 'xhigh',
    models: [
      { id: 'default', name: 'Default', resolvesTo: 'Opus 5.5', effortLevels: EFFORT_LEVELS },
      { id: 'opus', name: 'Opus 5.5', effortLevels: EFFORT_LEVELS },
      { id: 'sonnet', name: 'Sonnet 5.5', effortLevels: EFFORT_LEVELS },
      { id: 'haiku', name: 'Haiku 5.5', effortLevels: [] },
    ],
  },
  'train-status': { uv: false, ready: false, running: [] },
  'print-status': { slicers: [], downloads: {}, bambuConnect: false },
  'print-printers': [],
  'print-last-slice': null,
};

export interface App {
  page: Page;
  errors: string[];
  posts: Array<{ route: string; body: unknown }>;
  close: () => Promise<void>;
}

async function stubBackend(page: Page, posts: App['posts']): Promise<void> {
  await page.route('**/api/events', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }),
  );
  await page.route('**/api/bridge/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';

    if (route.request().method() === 'POST') posts.push({ route: name, body: route.request().postDataJSON() });

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
  const posts: App['posts'] = [];

  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await stubBackend(page, posts);
  await page.goto(server.resolvedUrls!.local[0]);
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
    timeout: 60000,
  });

  return {
    page,
    errors,
    posts,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}

export const partCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __studio: { parts: () => unknown[] } }).__studio.parts().length);
