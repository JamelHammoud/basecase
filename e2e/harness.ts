import { chromium, type Browser, type Page } from 'playwright-core';
import { inject } from 'vitest';
import { TEST_HOOKS_FLAG } from '../src/utils/platform/testHooksFlag';

const EFFORT_LEVELS = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
  { id: 'xhigh', name: 'Extra high' },
  { id: 'max', name: 'Max' },
];

const EARLIER_SCENE = {
  id: 'scene-earlier',
  name: 'Earlier Scene',
  globalGoal: '',
  updatedAt: '2026-01-01T00:00:00.000Z',
  partCount: 1,
};

const LISTS: Record<string, unknown> = {
  scenes: [EARLIER_SCENE],
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
  'phone-state': { status: 'off' },
  'upload-image': { id: 'image-1', name: 'Upload', dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
};

export interface App {
  page: Page;
  errors: string[];
  posts: Array<{ route: string; body: unknown }>;
  requests: string[];
  close: () => Promise<void>;
}

interface Backend {
  posts: App['posts'];
  lists: Record<string, unknown>;
  live: string[];
}

async function stubBackend(page: Page, { posts, lists, live }: Backend): Promise<void> {
  await page.route('**/api/events', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }),
  );
  await page.route('**/api/bridge/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';

    if (live.some((prefix) => name.startsWith(prefix))) return route.continue();

    if (route.request().method() === 'POST') posts.push({ route: name, body: route.request().postDataJSON() });

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(lists[name] ?? LISTS[name] ?? {}),
    });
  });
}

export const exposeTestHooks = (page: Page) =>
  page.addInitScript((flag) => Object.assign(window, { [flag]: true }), TEST_HOOKS_FLAG);

export const launchChrome = (args = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']) =>
  chromium.launch({ channel: 'chrome', headless: true, args });

export async function openApp(lists: Record<string, unknown> = {}, live: string[] = []): Promise<App> {
  const started = Date.now();
  const browser: Browser = await launchChrome();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  const posts: App['posts'] = [];
  const requests: string[] = [];

  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;

    const where = m.location().url;

    errors.push(where ? `${m.text()} (${where})` : m.text());
  });
  await exposeTestHooks(page);
  await stubBackend(page, { posts, lists, live });
  await page.goto(inject('appUrl'));
  await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio), null, {
    timeout: 60000,
  });
  console.log(`e2e: studio ready in ${Date.now() - started} ms from the ${inject('served')} server`);

  return {
    page,
    errors,
    posts,
    requests,
    close: () => browser.close(),
  };
}

export const partCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __studio: { parts: () => unknown[] } }).__studio.parts().length);

export const shown = (selector: string) => `${selector}:not([inert] *):visible`;

export type PlayTabName = 'Cases' | 'Routines' | 'Operate';

export const PLAY_RAIL = 'nav[aria-label="Sidebar views"] button[aria-label="Play"]';

export const playTab = (name: PlayTabName) => `[role="tablist"][aria-label="Play"] [role="tab"]:text-is("${name}")`;

export async function openPlayTab(page: Page, name: PlayTabName) {
  const rail = page.locator(shown(PLAY_RAIL)).first();

  if ((await rail.getAttribute('aria-pressed')) !== 'true') await rail.click();

  await page
    .locator(shown(playTab(name)))
    .first()
    .click();
}
