import { createServer } from 'node:http';
import { build } from 'vite';
import { chromium } from 'playwright-core';

interface WorkerHost extends Window {
  renderTestWorker: Worker;
  renderTestNextId: number;
  renderTestError: string | null;
  renderTestWaiting: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>;
}

export interface OffscreenTestWorker {
  run: <T>(argument: unknown) => Promise<T>;
  close: () => Promise<void>;
}

async function workerCode(modulePath: string, exported: string): Promise<string> {
  const entry = 'offscreen-worker-test';
  const module = `import { ${exported} as run } from ${JSON.stringify(modulePath)}; self.onmessage = async ({data: {id, payload}}) => { try { self.postMessage({id, result: await run(payload)}); } catch (e) { self.postMessage({id, error: String(e.stack || e) }); } };`;
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: entry,
        resolveId: (id) => (id === entry || id.endsWith(`/${entry}`) ? `\0${entry}` : null),
        load: (id) => (id === `\0${entry}` ? module : null),
      },
    ],
    build: {
      write: false,
      minify: false,
      rolldownOptions: { output: { codeSplitting: false } },
      lib: { entry, formats: ['es'] },
    },
  });
  const output = Array.isArray(built) ? built[0] : built;

  if (!('output' in output)) throw new Error('Expected completed render bundle');

  const chunk = output.output.find((item) => item.type === 'chunk');

  if (!chunk) throw new Error('Expected worker bundle');

  return chunk.code;
}

export async function openOffscreenWorker(modulePath: string, exported: string): Promise<OffscreenTestWorker> {
  const code = await workerCode(modulePath, exported);
  const server = createServer((request, response) => {
    response.setHeader('content-type', request.url === '/worker.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/worker.js' ? code : '<!doctype html><title>World rendering test</title>');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  const close = async () => {
    try {
      await browser?.close();
    } finally {
      server.close();
    }
  };

  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    });

    const page = await browser.newPage();
    const address = server.address();

    if (!address || typeof address === 'string') throw new Error('Expected test server port');

    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.evaluate(() => {
      const host = window as unknown as WorkerHost;
      const worker = new Worker('/worker.js', { type: 'module' });

      host.renderTestWorker = worker;
      host.renderTestNextId = 0;
      host.renderTestError = null;
      host.renderTestWaiting = new Map();
      worker.onmessage = ({ data }) => {
        const waiter = host.renderTestWaiting.get(data.id);

        if (!waiter) return;

        host.renderTestWaiting.delete(data.id);

        if (data.error) waiter.reject(new Error(data.error));
        else waiter.resolve(data.result);
      };
      worker.onerror = (event) => {
        host.renderTestError = event.message;
        host.renderTestWaiting.forEach((waiter) => waiter.reject(new Error(event.message)));
        host.renderTestWaiting.clear();
      };
    });

    return {
      close,
      run: <T>(argument: unknown) =>
        page.evaluate(
          (payload) =>
            new Promise<T>((resolve, reject) => {
              const host = window as unknown as WorkerHost;

              if (host.renderTestError) return reject(new Error(host.renderTestError));

              const id = ++host.renderTestNextId;

              host.renderTestWaiting.set(id, { resolve: (value) => resolve(value as T), reject });
              host.renderTestWorker.postMessage({ id, payload });
            }),
          argument,
        ),
    };
  } catch (error) {
    await close();

    throw error;
  }
}

export async function offscreenWorker<T>(modulePath: string, exported: string, argument: unknown = null): Promise<T> {
  const worker = await openOffscreenWorker(modulePath, exported);

  try {
    return await worker.run<T>(argument);
  } finally {
    await worker.close();
  }
}
