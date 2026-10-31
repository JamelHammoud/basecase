import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));

export const RUNTIME_MANIFEST = path.join(here, 'agent-runtimes.json');
export const PLATFORM = `${process.platform}-${process.arch}`;

const REGISTRY = 'https://registry.npmjs.org/';
const CODEX_TRIPLES = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
};
const IDENTITY = { env: {}, arg: (arg) => arg };

export function runtimeSpec(kind, platform = PLATFORM) {
  const exe = (name) => (platform.startsWith('win32') ? `${name}.exe` : name);
  const specs = {
    claude: {
      name: 'Claude Code',
      pkg: `@anthropic-ai/claude-agent-sdk-${platform}`,
      executable: exe('claude'),
      env: 'CLAUDE_CODE_EXECUTABLE',
    },
    codex: {
      name: 'Codex',
      pkg: `@openai/codex-${platform}`,
      executable: `vendor/${CODEX_TRIPLES[platform]}/bin/${exe('codex')}`,
      env: 'CODEX_PATH',
      extraEnv: { CODEX_MANAGED_BY_NPM: '1' },
    },
    gemini: { name: 'Gemini CLI', pkg: '@google/gemini-cli', module: 'node_modules/@google/gemini-cli/' },
  };

  return specs[kind] ?? null;
}

export function runtimeEntries(lock, platforms) {
  const names = ['claude', 'codex', 'gemini'].flatMap((kind) => platforms.map((p) => runtimeSpec(kind, p).pkg));

  return Object.fromEntries(
    Array.from(new Set(names))
      .map((pkg) => [pkg, lock.packages?.[`node_modules/${pkg}`]])
      .filter(([, entry]) => entry?.resolved && entry.integrity)
      .map(([pkg, { version, resolved, integrity }]) => [pkg, { version, resolved, integrity }]),
  );
}

function launch(spec, base) {
  const env = spec.env ? { [spec.env]: path.join(base, spec.executable), ...spec.extraEnv } : {};
  const arg = spec.module
    ? (a) => (a.startsWith(spec.module) ? path.join(base, a.slice(spec.module.length)) : a)
    : IDENTITY.arg;

  return { env, arg };
}

export const tarBinary = () =>
  process.platform === 'win32'
    ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    : '/usr/bin/tar';

function counter(onBytes) {
  return new Transform({
    transform(chunk, _encoding, done) {
      onBytes(chunk);
      done(null, chunk);
    },
  });
}

export class AgentRuntimes {
  constructor({ root, dir, manifest = RUNTIME_MANIFEST, fetchImpl = fetch }) {
    this.root = root;
    this.dir = dir;
    this.manifestFile = manifest;
    this.fetch = fetchImpl;
    this.pending = new Map();
  }

  manifest() {
    try {
      return JSON.parse(fs.readFileSync(this.manifestFile, 'utf8'));
    } catch {
      return {};
    }
  }

  async ensure(kind, onProgress = () => {}) {
    const spec = runtimeSpec(kind);

    if (!spec) return IDENTITY;

    if (fs.existsSync(path.join(this.root, 'node_modules', spec.pkg, 'package.json'))) return IDENTITY;

    const entry = this.manifest()[spec.pkg];

    if (!entry) throw new Error(`${spec.name} isn’t available for this computer.`);

    const folder = path.join(this.dir, PLATFORM, `${spec.pkg.replace('/', '+')}@${entry.version}`);
    const base = path.join(folder, 'package');

    if (!fs.existsSync(path.join(base, 'package.json')))
      await this.once(folder, () => this.install(spec, entry, folder, onProgress));

    return launch(spec, base);
  }

  once(folder, work) {
    if (!this.pending.has(folder))
      this.pending.set(
        folder,
        work().finally(() => this.pending.delete(folder)),
      );

    return this.pending.get(folder);
  }

  async install(spec, entry, folder, onProgress) {
    const temp = `${folder}.partial-${process.pid}-${Date.now()}`;

    fs.mkdirSync(temp, { recursive: true });

    try {
      const tarball = await this.download(spec, entry, { temp, onProgress });

      await promisify(execFile)(tarBinary(), ['-xzf', tarball, '-C', temp]);
      fs.rmSync(tarball);
      fs.rmSync(folder, { recursive: true, force: true });
      fs.renameSync(temp, folder);
      this.dropOlder(spec, folder);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }

  async download(spec, entry, { temp, onProgress }) {
    if (!entry.resolved.startsWith(REGISTRY)) throw new Error(`${spec.name} has no npm registry download.`);

    const res = await this.fetch(entry.resolved, { redirect: 'error' }).catch(() => null);

    if (!res?.ok || !res.body)
      throw new Error(`Couldn’t download ${spec.name}. Check your connection, then reconnect.`);

    const total = Number(res.headers.get('content-length')) || 0;
    const hash = crypto.createHash('sha512');
    const tarball = path.join(temp, 'package.tgz');
    let received = 0;

    await pipeline(
      Readable.fromWeb(res.body),
      counter((chunk) => {
        hash.update(chunk);
        received += chunk.length;
        onProgress({ name: spec.name, received, total });
      }),
      fs.createWriteStream(tarball),
    );

    if (`sha512-${hash.digest('base64')}` !== entry.integrity) {
      throw new Error(`${spec.name} didn’t match its checksum, so it wasn’t installed. Reconnect to try again.`);
    }

    return tarball;
  }

  dropOlder(spec, folder) {
    const parent = path.dirname(folder);
    const prefix = `${spec.pkg.replace('/', '+')}@`;

    for (const name of fs.readdirSync(parent)) {
      if (name.startsWith(prefix) && name !== path.basename(folder) && !name.includes('.partial-')) {
        fs.rmSync(path.join(parent, name), { recursive: true, force: true });
      }
    }
  }
}
