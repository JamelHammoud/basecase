import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fail, pass, ROOT, shCheck, toolEnv, vitestCheck } from '../lib/gate.mjs';

const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export default {
  id: 's3-contract',
  stage: 3,
  title: 'Task contract: one Rust crate, native and WASM',
  state: 'required',
  checks: [
    shCheck('cargo test passes', 'cargo', [
      'test',
      '--release',
      '--manifest-path',
      'forge/Cargo.toml',
      '-p',
      'contract',
    ]),
    vitestCheck('contract semantics hold and native matches WASM', 'verify/contract/contract.test.ts'),
    {
      name: 'the committed WASM rebuilds byte for byte',
      run: () => {
        const before = hash('src/skills/contract.wasm');

        execFileSync('npm', ['run', '--silent', 'build:contract'], { cwd: ROOT, stdio: 'pipe', env: toolEnv() });

        return hash('src/skills/contract.wasm') === before ? pass() : fail('Rebuilding changed the WASM');
      },
    },
  ],
  canaries: [
    shCheck('a planted false pass is caught', 'cargo', [
      'test',
      '--release',
      '--manifest-path',
      'forge/Cargo.toml',
      '-p',
      'contract',
      'canary_planted_false_pass_fails',
    ]),
  ],
};
