import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const crateSource = path.join(root, 'forge', 'crates', 'contract', 'src');
const output = path.join(root, 'src', 'skills', 'contract.wasm');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-wasm-'));

const FLAGS = [
  '--edition=2021',
  '--crate-name=contract',
  '--crate-type=cdylib',
  '--target=wasm32-unknown-unknown',
  '-Copt-level=s',
  '-Clto=fat',
  '-Ccodegen-units=1',
  '-Cpanic=abort',
  '-Cdebuginfo=0',
  '-Cstrip=symbols',
];

try {
  const result = spawnSync(
    'rustc',
    [...FLAGS, `--remap-path-prefix=${crateSource}=contract`, '--out-dir', scratch, 'lib.rs'],
    { cwd: crateSource, encoding: 'utf8' },
  );

  if (result.status !== 0) {
    process.stderr.write(result.error ? `${result.error}\n` : result.stderr);
    process.exitCode = 1;
  } else {
    fs.writeFileSync(output, fs.readFileSync(path.join(scratch, 'contract.wasm')));
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
