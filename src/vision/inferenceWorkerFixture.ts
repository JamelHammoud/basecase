import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright-core';

async function inferenceWorkerFiles() {
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: false,
      assetsInlineLimit: 0,
      rolldownOptions: {
        input: resolve(import.meta.dirname, 'inference.worker.ts'),
        output: { codeSplitting: false, entryFileNames: 'worker.js' },
      },
    },
  });
  const output = Array.isArray(built) ? built[0] : built;

  if (!('output' in output)) throw new Error('Expected the compiled inference worker.');

  return new Map(
    output.output.map((item) => [
      `/${item.fileName}`,
      {
        bytes: item.type === 'chunk' ? item.code : item.source,
        type: item.fileName.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      },
    ]),
  );
}

export async function openInferenceWorker(signal: AbortSignal) {
  const started = performance.now();
  const files = await inferenceWorkerFiles();

  signal.throwIfAborted();

  const server = createServer((request, response) => {
    const file = files.get(request.url ?? '/');

    response.setHeader('content-type', file?.type ?? 'text/html');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    response.end(file?.bytes ?? '<!doctype html><title>Inference worker test</title>');
  });
  let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  let closing: Promise<void> | undefined;
  const close = () => {
    signal.removeEventListener('abort', abort);
    closing ??= Promise.allSettled([
      browser?.close(),
      new Promise<void>((done) => {
        server.close(() => done());
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

  signal.addEventListener('abort', abort, { once: true });

  try {
    const listening = once(server, 'listening', { signal });

    server.listen({ port: 0, host: '127.0.0.1', signal });
    await listening;

    const address = server.address();

    if (!address || typeof address === 'string') throw new Error('Expected the inference test server port.');

    const graphics =
      process.platform === 'darwin'
        ? ['--use-angle=metal', '--enable-gpu']
        : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
    const launched = await chromium.launchPersistentContext('', {
      channel: 'chrome',
      headless: true,
      timeout: Math.max(1, 10000 - (performance.now() - started)),
      ignoreDefaultArgs: ['about:blank'],
      args: [
        ...graphics,
        '--ignore-gpu-blocklist',
        '--enable-unsafe-webgpu',
        `--app=http://127.0.0.1:${address.port}/`,
      ],
    });

    if (signal.aborted) {
      await launched.close();
      signal.throwIfAborted();
    }

    browser = launched;

    const page = browser.pages()[0];

    if (!page) throw new Error('Expected the inference test page.');

    return { page, close };
  } catch (error) {
    await close();

    throw error;
  }
}
