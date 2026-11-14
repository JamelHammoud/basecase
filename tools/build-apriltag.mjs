import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'tools', 'apriltag');
const output = path.join(root, 'public', 'apriltag', 'apriltag.wasm');

const FLAGS = [
  '--edition=2021',
  '--crate-name=apriltag',
  '--crate-type=cdylib',
  '--target=wasm32-unknown-unknown',
  '-Copt-level=3',
  '-Clto=fat',
  '-Ccodegen-units=1',
  '-Cpanic=abort',
  '-Cdebuginfo=0',
  '-Cstrip=symbols',
];

function runs(command) {
  return spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0;
}

function fromRustup() {
  const result = spawnSync('rustup', ['which', 'rustc'], { encoding: 'utf8' });

  return result.status === 0 ? result.stdout.trim() : null;
}

function fromToolchains() {
  const toolchains = path.join(os.homedir(), '.rustup', 'toolchains');

  if (!fs.existsSync(toolchains)) return null;

  const stable = fs
    .readdirSync(toolchains)
    .filter((name) => name.startsWith('stable-'))
    .map((name) => path.join(toolchains, name, 'bin', process.platform === 'win32' ? 'rustc.exe' : 'rustc'))
    .find((candidate) => fs.existsSync(candidate));

  return stable ?? null;
}

function findRustc() {
  if (runs('rustc')) return 'rustc';

  return fromRustup() ?? fromToolchains();
}

const rustc = findRustc();

if (!rustc) {
  process.stderr.write(
    'rustc not found. Install Rust with rustup and run `rustup target add wasm32-unknown-unknown`.\n',
  );
  process.exit(1);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'apriltag-wasm-'));

try {
  const result = spawnSync(
    rustc,
    [...FLAGS, `--remap-path-prefix=${source}=apriltag`, '--out-dir', scratch, 'lib.rs'],
    { cwd: source, encoding: 'utf8' },
  );

  if (result.status !== 0) {
    process.stderr.write(result.error ? `${result.error}\n` : result.stderr);
    process.exitCode = 1;
  } else {
    process.stderr.write(result.stderr ?? '');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, fs.readFileSync(path.join(scratch, 'apriltag.wasm')));
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
