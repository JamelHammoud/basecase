import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeRoboflowOptions {
  key: string;
  port?: number;
  archive?: Uint8Array;
  exportLink?: string;
  redirectTo?: string;
}

export async function startFakeRoboflow(options: FakeRoboflowOptions) {
  const requests: Array<{ path: string; key: string | null }> = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake.invalid');

    requests.push({ path: url.pathname, key: url.searchParams.get('api_key') });

    if (url.pathname === '/archive.zip') {
      res.writeHead(200, { 'Content-Type': 'application/zip' }).end(Buffer.from(options.archive ?? [80, 75, 3, 4]));

      return;
    }

    if (url.searchParams.get('api_key') !== options.key) {
      res.writeHead(403).end(JSON.stringify({ error: options.key }));

      return;
    }

    if (options.redirectTo && url.pathname.endsWith('/coco')) {
      res.writeHead(302, { Location: options.redirectTo }).end();

      return;
    }

    const address = server.address() as AddressInfo;
    const link = options.exportLink ?? `http://127.0.0.1:${address.port}/archive.zip`;
    const body = url.pathname.endsWith('/coco')
      ? { export: { link } }
      : { workspace: 'workspace', versions: [{ id: 'workspace/project/2' }] };

    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
