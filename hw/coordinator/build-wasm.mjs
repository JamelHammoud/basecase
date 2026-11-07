import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const crate = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(crate, '..', '..');
const TARGET = 'wasm32-unknown-unknown';
const OUT_WASM = path.join(root, 'src', 'routines', 'coordinator.wasm');
const OUT_RECORD = path.join(root, 'src', 'routines', 'coordinator.build.json');
const SOURCE_PATTERN = /^(Cargo\.toml|Cargo\.lock|src\/.*\.rs)$/;

function listSources(dir = crate, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) return entry.name === 'target' ? [] : listSources(path.join(dir, entry.name), rel);

    return SOURCE_PATTERN.test(rel) ? [rel] : [];
  });
}

export function sourceHash() {
  const hash = createHash('sha256');

  for (const rel of listSources().sort()) {
    const text = fs.readFileSync(path.join(crate, rel), 'utf8').replace(/\r\n/g, '\n');

    hash.update(`${rel}\n${text}\n`);
  }

  return hash.digest('hex');
}

function findCargo() {
  const exe = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
  const candidates = [
    process.env.CARGO,
    path.join(os.homedir(), '.cargo', 'bin', exe),
    '/opt/homebrew/opt/rustup/bin/cargo',
  ];

  return candidates.find((c) => c && fs.existsSync(c)) ?? exe;
}

function build(targetDir) {
  const args = ['build', '--release', '--locked', '--target', TARGET, '--target-dir', targetDir];
  const cargo = findCargo();
  const env = { ...process.env, PATH: [path.dirname(cargo), process.env.PATH].join(path.delimiter) };
  const result = spawnSync(cargo, args, { cwd: crate, stdio: 'inherit', env });

  if (result.status !== 0) throw new Error('cargo build failed');

  return fs.readFileSync(path.join(targetDir, TARGET, 'release', 'basecase_coordinator.wasm'));
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function main() {
  const check = process.argv.includes('--check');
  const cache = path.join(root, 'node_modules', '.cache', 'basecase-coordinator');
  const targetDir = check ? fs.mkdtempSync(path.join(os.tmpdir(), 'coordinator-')) : cache;
  const bytes = build(targetDir);

  if (check) {
    const same = fs.existsSync(OUT_WASM) && sha(fs.readFileSync(OUT_WASM)) === sha(bytes);

    fs.rmSync(targetDir, { recursive: true, force: true });
    console.log(same ? 'coordinator.wasm matches a clean build.' : 'coordinator.wasm differs from a clean build.');
    process.exit(same ? 0 : 1);
  }

  fs.writeFileSync(OUT_WASM, bytes);
  fs.writeFileSync(OUT_RECORD, `${JSON.stringify({ sources: sourceHash(), wasm: sha(bytes) }, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, OUT_WASM)} (${bytes.length} bytes).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
