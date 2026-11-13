import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface CommitLine {
  key: string;
  value: Record<string, unknown>;
}

export interface FakeRepo {
  kind: 'dataset' | 'model';
  files: Map<string, Buffer>;
  tags: Map<string, number>;
  commits: CommitLine[][];
}

export interface FakeHubRequest {
  method: string;
  path: string;
  auth: string | undefined;
}

export interface FakeHubOptions {
  token: string;
  name?: string;
  role?: string;
  multipartOver?: number;
  uploadHost?: string;
  failCommit?: string;
}

export interface FakeHub {
  url: string;
  repos: Map<string, FakeRepo>;
  requests: FakeHubRequest[];
  close: () => Promise<void>;
}

interface Ctx {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  match: RegExpExecArray;
  body: Buffer;
}

type Handler = (ctx: Ctx) => void;

interface Route {
  method: string;
  pattern: RegExp;
  handle: Handler;
  auth: boolean;
}

const LFS_FILE = /\.(parquet|mp4|bin|safetensors|onnx)$/;
const PART_SIZE = 1024;

const send = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

const json = (body: Buffer) => JSON.parse(body.toString('utf-8') || '{}');

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

class FakeHubServer {
  readonly repos = new Map<string, FakeRepo>();
  readonly requests: FakeHubRequest[] = [];
  private readonly stored = new Map<string, Buffer>();
  private readonly parts = new Map<string, Buffer[]>();
  private readonly name: string;
  url = '';
  private uploadBase = '';
  private readonly options: FakeHubOptions;

  constructor(options: FakeHubOptions) {
    this.options = options;
    this.name = options.name ?? 'tester';
  }

  listen(server: http.Server) {
    const port = (server.address() as AddressInfo).port;

    this.url = `http://127.0.0.1:${port}`;
    this.uploadBase = `http://${this.options.uploadHost ?? '127.0.0.1'}:${port}`;
  }

  routes(): Route[] {
    return [
      { method: 'GET', pattern: /^\/api\/whoami-v2$/, handle: (c) => this.whoami(c), auth: true },
      { method: 'POST', pattern: /^\/api\/repos\/create$/, handle: (c) => this.create(c), auth: true },
      {
        method: '*',
        pattern: /^\/api\/(datasets|models)\/([^/]+)\/([^/]+)\/(tree|preupload|commit|tag)\/(.+)$/,
        handle: (c) => this.repoApi(c),
        auth: true,
      },
      {
        method: 'POST',
        pattern: /^\/(datasets\/)?([^/]+)\/([^/]+)\.git\/info\/lfs\/objects\/batch$/,
        handle: (c) => this.batch(c),
        auth: true,
      },
      { method: 'PUT', pattern: /^\/lfs\/([0-9a-f]{64})$/, handle: (c) => this.putObject(c), auth: false },
      { method: 'PUT', pattern: /^\/lfs\/([0-9a-f]{64})\/part\/(\d+)$/, handle: (c) => this.putPart(c), auth: false },
      { method: 'POST', pattern: /^\/lfs\/([0-9a-f]{64})\/complete$/, handle: (c) => this.complete(c), auth: false },
      {
        method: 'POST',
        pattern: /^\/lfs\/([0-9a-f]{64})\/verify$/,
        handle: (c) => send(c.res, this.stored.has(c.match[1]) ? 200 : 404, {}),
        auth: true,
      },
    ];
  }

  async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const path = new URL(req.url ?? '/', this.url).pathname;
    const body = await readBody(req);

    this.requests.push({ method: req.method ?? '', path, auth: req.headers.authorization });

    for (const route of this.routes()) {
      const match = route.pattern.exec(path);

      if (!match || (route.method !== '*' && route.method !== req.method)) continue;

      if (route.auth && req.headers.authorization !== `Bearer ${this.options.token}`) {
        return send(res, 401, { error: 'Invalid credentials in Authorization header' });
      }

      return route.handle({ req, res, match, body });
    }

    send(res, 404, { error: 'Not found' });
  }

  private whoami(ctx: Ctx) {
    send(ctx.res, 200, {
      name: this.name,
      type: 'user',
      auth: { accessToken: { role: this.options.role ?? 'write' } },
    });
  }

  private create(ctx: Ctx) {
    const body = json(ctx.body);
    const id = `${this.name}/${body.name}`;

    if (this.repos.has(id)) return send(ctx.res, 409, { error: 'You already created this repo' });

    this.repos.set(id, {
      kind: body.type ?? 'model',
      files: new Map([['.gitattributes', Buffer.from('*.parquet filter=lfs\n')]]),
      tags: new Map(),
      commits: [],
    });
    send(ctx.res, 200, { url: `${this.url}/datasets/${id}` });
  }

  private repoApi(ctx: Ctx) {
    const repo = this.repos.get(`${ctx.match[2]}/${ctx.match[3]}`);

    if (!repo) return send(ctx.res, 404, { error: 'Repository not found' });

    const handlers: Record<string, (repo: FakeRepo) => void> = {
      tree: (r) =>
        send(
          ctx.res,
          200,
          [...r.files].map(([path, b]) => ({ type: 'file', path, size: b.length })),
        ),
      preupload: () => this.preupload(ctx),
      commit: (r) => this.commit(ctx, r),
      tag: (r) => this.tag(ctx, r),
    };

    handlers[ctx.match[4]](repo);
  }

  private preupload(ctx: Ctx) {
    const files = (json(ctx.body).files ?? []) as Array<{ path: string }>;

    send(ctx.res, 200, {
      files: files.map((f) => ({
        path: f.path,
        uploadMode: LFS_FILE.test(f.path) ? 'lfs' : 'regular',
        shouldIgnore: false,
      })),
    });
  }

  private applyLine(repo: FakeRepo, line: CommitLine) {
    const path = String(line.value.path ?? '');

    if (line.key === 'file') repo.files.set(path, Buffer.from(String(line.value.content), 'base64'));

    if (line.key === 'deletedFile') repo.files.delete(path);

    if (line.key !== 'lfsFile') return true;

    const bytes = this.stored.get(String(line.value.oid));

    if (bytes) repo.files.set(path, bytes);

    return !!bytes;
  }

  private commit(ctx: Ctx, repo: FakeRepo) {
    if (this.options.failCommit) return send(ctx.res, 500, { error: this.options.failCommit });

    const lines: CommitLine[] = ctx.body
      .toString('utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    if (lines[0]?.key !== 'header') return send(ctx.res, 400, { error: 'Missing header' });

    if (!lines.slice(1).every((l) => this.applyLine(repo, l))) {
      return send(ctx.res, 422, { error: 'LFS object missing' });
    }

    repo.commits.push(lines);
    send(ctx.res, 200, {
      commitOid: `c${repo.commits.length}`,
      commitUrl: `${this.url}/commit/${repo.commits.length}`,
    });
  }

  private tag(ctx: Ctx, repo: FakeRepo) {
    if (ctx.req.method === 'DELETE') {
      const had = repo.tags.delete(ctx.match[5]);

      return send(ctx.res, had ? 200 : 404, had ? {} : { error: 'Tag not found' });
    }

    const wanted = String(json(ctx.body).tag);

    if (repo.tags.has(wanted)) return send(ctx.res, 409, { error: 'Tag exists' });

    repo.tags.set(wanted, repo.commits.length);
    send(ctx.res, 200, {});
  }

  private uploadActions(oid: string, size: number) {
    const verify = { href: `${this.url}/lfs/${oid}/verify` };
    const over = this.options.multipartOver;

    if (!over || size <= over) return { upload: { href: `${this.uploadBase}/lfs/${oid}` }, verify };

    const header: Record<string, string> = { chunk_size: String(PART_SIZE) };

    for (let i = 0; i * PART_SIZE < size; i += 1) {
      header[String(i + 1).padStart(5, '0')] = `${this.uploadBase}/lfs/${oid}/part/${i + 1}`;
    }

    return { upload: { href: `${this.uploadBase}/lfs/${oid}/complete`, header }, verify };
  }

  private batch(ctx: Ctx) {
    const { objects } = json(ctx.body) as { objects: Array<{ oid: string; size: number }> };

    send(ctx.res, 200, {
      transfer: this.options.multipartOver ? 'multipart' : 'basic',
      objects: objects.map((o) => (this.stored.has(o.oid) ? o : { ...o, actions: this.uploadActions(o.oid, o.size) })),
    });
  }

  private putObject(ctx: Ctx) {
    if (sha(ctx.body) !== ctx.match[1]) return send(ctx.res, 400, { error: 'Checksum mismatch' });

    this.stored.set(ctx.match[1], ctx.body);
    send(ctx.res, 200, {});
  }

  private putPart(ctx: Ctx) {
    const list = this.parts.get(ctx.match[1]) ?? [];

    list[Number(ctx.match[2]) - 1] = ctx.body;
    this.parts.set(ctx.match[1], list);
    send(ctx.res, 200, {}, { ETag: `"part-${ctx.match[2]}"` });
  }

  private complete(ctx: Ctx) {
    const whole = Buffer.concat(this.parts.get(ctx.match[1]) ?? []);
    const listed = (json(ctx.body).parts ?? []) as Array<{ etag: string }>;

    if (sha(whole) !== ctx.match[1] || !listed.length || listed.some((p) => !p.etag)) {
      return send(ctx.res, 400, { error: 'Bad parts' });
    }

    this.stored.set(ctx.match[1], whole);
    send(ctx.res, 200, {});
  }
}

export async function startFakeHub(options: FakeHubOptions): Promise<FakeHub> {
  const hub = new FakeHubServer(options);
  const server = http.createServer((req, res) => void hub.handle(req, res));

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  hub.listen(server);

  return {
    url: hub.url,
    repos: hub.repos,
    requests: hub.requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
