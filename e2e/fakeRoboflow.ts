import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeRoboflowOptions {
  key: string;
  port?: number;
  archive?: Uint8Array;
  versionArchives?: Record<number, Uint8Array>;
  exportLink?: string;
  redirectTo?: string;
  latest?: number;
  beforeExport?: () => Promise<void>;
  exportReply?: { status: number; body: unknown };
}

function archiveBytes(options: FakeRoboflowOptions, url: URL) {
  return (
    options.versionArchives?.[Number(url.searchParams.get('version'))] ??
    options.archive ??
    new Uint8Array([80, 75, 3, 4])
  );
}

export async function startFakeRoboflow(options: FakeRoboflowOptions) {
  const requests: Array<{ path: string; key: string | null }> = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake.invalid');

    requests.push({ path: url.pathname, key: url.searchParams.get('api_key') });

    if (url.pathname === '/archive.zip') {
      res.writeHead(200, { 'Content-Type': 'application/zip' }).end(Buffer.from(archiveBytes(options, url)));

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

    if (url.pathname.endsWith('/coco')) await options.beforeExport?.();

    const address = server.address() as AddressInfo;
    const link =
      options.exportLink ?? `http://127.0.0.1:${address.port}/archive.zip?version=${url.pathname.split('/')[3]}`;

    if (url.pathname.endsWith('/coco') && options.exportReply) {
      res
        .writeHead(options.exportReply.status, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(options.exportReply.body));

      return;
    }

    const body = url.pathname.endsWith('/coco')
      ? { export: { link } }
      : { workspace: 'workspace', versions: [{ id: `workspace/project/${options.latest ?? 2}` }] };

    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    advance: (next: Partial<FakeRoboflowOptions>) => Object.assign(options, next),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
