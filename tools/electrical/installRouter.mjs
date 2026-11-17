import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { findOnPath } from '../../electron/executables.mjs';
import { ROUTER_VERSION, ROUTER_HASH, verifyRoutingRuntime } from '../../electron/electrical/routeTools.mjs';

const releases = {
  'darwin-arm64': ['aarch64_mac', 'tar.gz', '225bab0a09491ef06835488cd942f5d2befa9a0410a2484f0c8bbcf7506ec09a'],
  'darwin-x64': ['x64_mac', 'tar.gz', 'c909674b1c10c261b9a3fb7e9c0efebd303e33f88a4fe84be7135b5e2d711f89'],
  'linux-x64': ['x64_linux', 'tar.gz', 'a535a1df9c6284d9618872984e026ae0352d1f7e9e0605425c0e6114f47351dd'],
  'win32-x64': ['x64_windows', 'zip', '2332c0b4cff6bed722da3567c91d5e47568bcba863fa4945d0a8d6fc76158628'],
};

async function download(url, file, expected) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });

  if (!response.ok || !response.body) throw new Error('board-router');

  const hash = createHash('sha256');
  const handle = await fs.open(file, 'wx');
  let bytes = 0;

  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;

      if (bytes > 80 * 1024 * 1024) throw new Error('board-route-limit');

      hash.update(chunk);
      await handle.writeFile(chunk);
    }
  } finally {
    await handle.close();
  }

  if (hash.digest('hex') !== expected) throw new Error('board-router');
}

function extract(archive, directory) {
  const command = findOnPath('tar');

  if (!command) throw new Error('board-router');

  const result = spawnSync(command, ['-xf', archive, '-C', directory], {
    windowsHide: true,
    stdio: 'pipe',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });

  if (result.error || result.status !== 0) throw new Error('board-router');
}

export async function installBoardRouter(directory) {
  const release = releases[`${process.platform}-${process.arch}`];

  if (!release) throw new Error('board-router');

  const target = path.resolve(directory);

  await fs.mkdir(path.dirname(target), { recursive: true });

  const staging = await fs.mkdtemp(path.join(path.dirname(target), '.board-router-install-'));

  try {
    const [platform, extension, digest] = release;
    const archive = path.join(staging, `runtime.${extension}`);
    const name = `OpenJDK21U-jre_${platform}_hotspot_21.0.13_9.${extension}`;
    const jarName = `freerouting-${ROUTER_VERSION}.jar`;

    await download(
      `https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/${name}`,
      archive,
      digest,
    );
    await download(
      `https://github.com/freerouting/freerouting/releases/download/v${ROUTER_VERSION}/${jarName}`,
      path.join(staging, jarName),
      ROUTER_HASH,
    );
    extract(archive, staging);

    const extracted = path.join(staging, 'jdk-21.0.13+9-jre');
    const runtime = process.platform === 'darwin' ? path.join(extracted, 'Contents', 'Home') : extracted;
    const installed = path.join(staging, 'installed');

    await fs.mkdir(installed);
    await fs.rename(runtime, path.join(installed, 'runtime'));
    await fs.rename(path.join(staging, jarName), path.join(installed, jarName));
    await verifyRoutingRuntime(
      { java: path.join(installed, 'runtime', 'bin', process.platform === 'win32' ? 'java.exe' : 'java') },
      { cwd: installed },
    );
    await fs.rename(installed, target);

    return target;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main();
}

async function main() {
  const directory = process.argv[process.argv.indexOf('--directory') + 1];

  if (!process.argv.includes('--directory') || !directory) throw new Error('board-router');

  const installed = await installBoardRouter(directory);

  if (process.env.GITHUB_ENV) await fs.appendFile(process.env.GITHUB_ENV, `BASECASE_ROUTING_TOOLS=${installed}\n`);

  process.stdout.write(`${JSON.stringify({ directory: installed })}\n`);
}
