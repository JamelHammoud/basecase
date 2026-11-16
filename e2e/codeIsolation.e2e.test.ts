import { readFile } from 'node:fs/promises';
import type { Browser } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { CODE_PANEL_SANDBOX, codePanelDocument } from '../src/cases/console/codeDocument';
import { launchChrome } from './harness';

let browser: Browser;

const ORIGIN = 'http://code-isolation.test';
const PROBES = `<script>
const mark = (name, value) => parent.postMessage({ probe: name, value }, '*');
const probe = (name, run) => {
  try { run(); mark(name, 'allowed'); } catch { mark(name, 'blocked'); }
};
fetch('${ORIGIN}/fetch').then(() => mark('fetch', 'allowed'), () => mark('fetch', 'blocked'));
try {
  const socket = new WebSocket('ws://code-isolation.test/socket');
  socket.onopen = () => mark('socket', 'allowed');
  socket.onerror = () => mark('socket', 'blocked');
} catch { mark('socket', 'blocked'); }
probe('top', () => { top.location = '${ORIGIN}/top'; });
probe('parent', () => parent.document.title);
probe('storage', () => localStorage.setItem('code', 'panel'));
probe('cookie', () => document.cookie);
try {
  indexedDB.databases().then(() => mark('indexedDB', 'allowed'), () => mark('indexedDB', 'blocked'));
} catch { mark('indexedDB', 'blocked'); }
</script>`;
const AWAY = `<script>
addEventListener('securitypolicyviolation', (event) => {
  if (event.effectiveDirective === 'frame-src') parent.postMessage({ probe: 'self', value: 'blocked' }, '*');
});
location.href = '${ORIGIN}/self';
</script>`;

beforeAll(async () => {
  browser = await launchChrome();
});

afterAll(async () => {
  await browser?.close();
});

it('enforces code panel network, storage, parent and navigation isolation without starting the studio', async () => {
  const page = await browser.newPage();
  const requests: string[] = [];
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const policies = html.match(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/gi) ?? [];

  expect(policies.length).toBeGreaterThan(0);
  await page.route('**/*', (route) => {
    const url = route.request().url();

    if (url === `${ORIGIN}/`) {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html>${policies.join('')}<body></body>` });
    }

    requests.push(url);

    return route.abort();
  });

  await page.routeWebSocket('**/*', (socket) => {
    requests.push(socket.url());
    socket.close();
  });

  try {
    await page.goto(`${ORIGIN}/`);
    await page.evaluate(
      ({ sandbox, sources }) => {
        const results: Record<string, string> = {};

        addEventListener('message', (event) => {
          results[event.data.probe] = event.data.value;
          document.body.dataset.results = JSON.stringify(results);
        });
        document.addEventListener('securitypolicyviolation', (event) => {
          if (event.effectiveDirective === 'frame-src') results.self = 'blocked';

          document.body.dataset.results = JSON.stringify(results);
        });

        for (const source of sources) {
          const frame = document.createElement('iframe');

          frame.setAttribute('sandbox', sandbox);
          frame.srcdoc = source;
          document.body.append(frame);
        }
      },
      { sandbox: CODE_PANEL_SANDBOX, sources: [codePanelDocument(PROBES), codePanelDocument(AWAY)] },
    );
    await expect
      .poll(() =>
        page
          .locator('body')
          .getAttribute('data-results')
          .then((value) => JSON.parse(value ?? '{}')),
      )
      .toEqual({
        fetch: 'blocked',
        socket: 'blocked',
        top: 'blocked',
        parent: 'blocked',
        storage: 'blocked',
        cookie: 'blocked',
        indexedDB: 'blocked',
        self: 'blocked',
      });
    expect(page.url()).toBe(`${ORIGIN}/`);
    expect(requests).toEqual([]);
  } finally {
    await page.close();
  }
});
