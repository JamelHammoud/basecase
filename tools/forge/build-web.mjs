import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const forge = path.join(root, 'forge');
const TARGET = 'wasm32-unknown-unknown';
const OUT_WASM = path.join(root, 'src', 'forge', 'forge.wasm');
const OUT_RECORD = path.join(root, 'src', 'forge', 'forge.build.json');
const CRATES = ['forge-ir', 'forge-sim', 'forge-train', 'forge-reward', 'forge-web'];
const SOURCE = /\.(rs|wgsl|toml)$/;
const CONFIG = [
  'profile.release.opt-level=3',
  'profile.release.lto="fat"',
  'profile.release.codegen-units=1',
  'profile.release.panic="abort"',
  'profile.release.strip=true',
];

function listSources(dir, prefix) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = `${prefix}/${entry.name}`;

    if (entry.isDirectory())
      return ['target', 'tests', 'examples'].includes(entry.name) ? [] : listSources(path.join(dir, entry.name), rel);

    return SOURCE.test(entry.name) ? [rel] : [];
  });
}

export function sourceHash() {
  const hash = createHash('sha256');
  const files = CRATES.flatMap((c) => listSources(path.join(forge, 'crates', c), c)).sort();

  for (const rel of [...files, 'Cargo.lock']) {
    const file = rel === 'Cargo.lock' ? path.join(forge, rel) : path.join(forge, 'crates', rel);

    hash.update(`${rel}\n${fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')}\n`);
  }

  return hash.digest('hex');
}

function findCargo() {
  const exe = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
  const candidates = [process.env.CARGO, path.join(os.homedir(), '.cargo', 'bin', exe)];

  return candidates.find((c) => c && fs.existsSync(c)) ?? exe;
}

function build(targetDir) {
  const cargo = findCargo();
  const config = CONFIG.flatMap((c) => ['--config', c]);
  const args = [
    'build',
    '--release',
    '--locked',
    '-p',
    'forge-web',
    '--target',
    TARGET,
    '--target-dir',
    targetDir,
    ...config,
  ];
  const env = {
    ...process.env,
    PATH: [path.dirname(cargo), process.env.PATH].join(path.delimiter),
    RUSTFLAGS: `-C target-feature=+simd128 --remap-path-prefix=${forge}=forge`,
  };
  const result = spawnSync(cargo, args, { cwd: forge, stdio: 'inherit', env });

  if (result.status !== 0) throw new Error('cargo build failed');

  return fs.readFileSync(path.join(targetDir, TARGET, 'release', 'forge_web.wasm'));
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function main() {
  const check = process.argv.includes('--check');
  const targetDir = path.join(root, 'node_modules', '.cache', 'forge-web');
  const bytes = build(targetDir);

  if (check) {
    const same = fs.existsSync(OUT_WASM) && sha(fs.readFileSync(OUT_WASM)) === sha(bytes);

    console.log(same ? 'forge.wasm matches a fresh build.' : 'forge.wasm differs from a fresh build.');
    process.exit(same ? 0 : 1);
  }

  fs.writeFileSync(OUT_WASM, bytes);
  fs.writeFileSync(OUT_RECORD, `${JSON.stringify({ sources: sourceHash(), wasm: sha(bytes) }, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, OUT_WASM)} (${bytes.length} bytes).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
