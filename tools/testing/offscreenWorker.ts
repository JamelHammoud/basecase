import { createServer } from 'node:http';
import { once } from 'node:events';
import { build, normalizePath } from 'vite';
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

interface OffscreenWorkerOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export async function workerCode(modulePath: string, exported: string): Promise<string> {
  const entry = 'offscreen-worker-test';
  const module = `import { ${exported} as run } from ${JSON.stringify(normalizePath(modulePath))}; self.onmessage = async ({data: {id, payload}}) => { try { self.postMessage({id, result: await run(payload)}); } catch (e) { self.postMessage({id, error: String(e.stack || e) }); } }; self.postMessage({ready: true});`;
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: entry,
        resolveId: (id) => (id === entry ? `\0${entry}` : null),
        load: (id) => (id === `\0${entry}` ? module : null),
      },
    ],
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: entry, output: { codeSplitting: false } },
      lib: { entry, formats: ['es'] },
    },
  });
  const output = Array.isArray(built) ? built[0] : built;

  if (!('output' in output)) throw new Error('Expected completed render bundle');

  const chunk = output.output.find((item) => item.type === 'chunk');

  if (!chunk) throw new Error('Expected worker bundle');

  return chunk.code;
}

function initializeWorker(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const host = window as unknown as WorkerHost;
    const worker = new Worker('/worker.js', { type: 'module' });

    host.renderTestWorker = worker;
    host.renderTestNextId = 0;
    host.renderTestError = null;
    host.renderTestWaiting = new Map();
    worker.onmessage = ({ data }) => {
      if (data.ready) return resolve();

      const waiter = host.renderTestWaiting.get(data.id);

      if (!waiter) return;

      host.renderTestWaiting.delete(data.id);

      if (data.error) waiter.reject(new Error(data.error));
      else waiter.resolve(data.result);
    };
    worker.onerror = (event) => {
      reject(new Error(event.message));
      host.renderTestError = event.message;
      host.renderTestWaiting.forEach((waiter) => waiter.reject(new Error(event.message)));
      host.renderTestWaiting.clear();
    };
  });
}

export async function openOffscreenWorker(
  modulePath: string,
  exported: string,
  { signal, timeout = 15000 }: OffscreenWorkerOptions = {},
): Promise<OffscreenTestWorker> {
  const started = performance.now();

  signal?.throwIfAborted();

  const code = await workerCode(modulePath, exported);

  signal?.throwIfAborted();

  const server = createServer((request, response) => {
    response.setHeader('content-type', request.url === '/worker.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/worker.js' ? code : '<!doctype html><title>World rendering test</title>');
  });

  let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;
  let closed = false;
  let closing: Promise<void> | undefined;
  const close = () => {
    closed = true;
    signal?.removeEventListener('abort', abort);
    closing ??= Promise.allSettled([
      browser?.close(),
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
    ]).then((results) => {
      const failed = results.find((result) => result.status === 'rejected');

      if (failed?.status === 'rejected') throw failed.reason;
    });

    return closing;
  };
  const abort = () => {
    void close().catch(() => undefined);
  };

  signal?.addEventListener('abort', abort, { once: true });

  try {
    const listening = once(server, 'listening', { signal });

    server.listen({ port: 0, host: '127.0.0.1', signal });
    await listening;

    const address = server.address();

    if (!address || typeof address === 'string') throw new Error('Expected test server port');

    const launched = await chromium.launchPersistentContext('', {
      channel: 'chrome',
      headless: true,
      timeout: Math.max(1, timeout - (performance.now() - started)),
      ignoreDefaultArgs: ['about:blank'],
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--app=http://127.0.0.1:${address.port}/`],
    });

    if (closed) {
      await launched.close();
      signal?.throwIfAborted();

      throw new Error('Worker setup closed');
    }

    browser = launched;

    const page = browser.pages()[0];

    if (!page) throw new Error('Expected test page');

    await page.evaluate(initializeWorker);
    signal?.throwIfAborted();

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
