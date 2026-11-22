import type { Page } from 'playwright-core';

function workerFailureTrace() {
  const NativeWorker = window.Worker;
  let reported = 0;
  const report = (value: { path: string; kind: string; error: string; id?: number }) => {
    if (reported >= 20) return;

    reported++;
    console.debug('e2e worker failure:', JSON.stringify({ ...value, error: value.error.slice(0, 500) }));
  };

  window.Worker = class extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);

      const parsed = new URL(String(url), location.href);
      const path = /^https?:$/.test(parsed.protocol) ? parsed.pathname.slice(-200) : parsed.protocol;

      this.addEventListener('message', (event: MessageEvent) => {
        const value = event.data as { error?: unknown; id?: number } | null;

        if (typeof value?.error !== 'string') return;

        report({ path, kind: 'reply', error: value.error, id: value.id });
      });
      this.addEventListener('error', (event: ErrorEvent) => report({ path, kind: 'runtime', error: event.message }));
    }
  };
}

export async function installBrowserWorkerTrace(page: Page) {
  if (process.env.BASECASE_DIAGNOSTIC_BROWSER_TRACE !== '1') return;

  page.on('console', (message) => {
    if (message.type() === 'debug' && message.text().startsWith('e2e worker failure:')) console.log(message.text());
  });
  await page.addInitScript(workerFailureTrace);
}
