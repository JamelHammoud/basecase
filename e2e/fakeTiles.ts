import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fixtureTileBytes } from '../src/earth/tileFixture';

export const AWAY_PATH = '/v1/3dtiles/files/away.glb';

export interface FakeTilesRequest {
  path: string;
  key: string | null;
  session: string | null;
}

export interface FakeTilesOptions {
  key: string;
  port?: number;
  awayTo?: string;
}

export interface FakeTiles {
  url: string;
  requests: FakeTilesRequest[];
  close: () => Promise<void>;
}

function answer(url: URL, options: FakeTilesOptions, res: http.ServerResponse): void {
  if (url.searchParams.get('key') !== options.key) {
    res.writeHead(403, { 'Content-Type': 'application/json' }).end('{"error":{"message":"API key not valid."}}');

    return;
  }

  if (url.pathname === AWAY_PATH && options.awayTo) {
    res.writeHead(302, { Location: options.awayTo }).end();

    return;
  }

  const bytes = fixtureTileBytes(url.pathname);

  if (!bytes) {
    res.writeHead(404).end();

    return;
  }

  const type = url.pathname.endsWith('.json') ? 'application/json' : 'model/gltf-binary';

  res.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length }).end(Buffer.from(bytes));
}

export async function startFakeTiles(options: FakeTilesOptions): Promise<FakeTiles> {
  const requests: FakeTilesRequest[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake.invalid');

    requests.push({ path: url.pathname, key: url.searchParams.get('key'), session: url.searchParams.get('session') });
    answer(url, options, res);
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
