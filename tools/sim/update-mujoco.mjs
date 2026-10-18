/**
 * Updates MuJoCo everywhere Basecase uses it, in one step:
 *   - the app's simulator: @mujoco/mujoco (DeepMind's official WASM build) in package.json
 *   - the trainer: mujoco==<version> in electron/trainer/pyproject.toml and uv.lock
 * then runs the smoke test (tools/sim/smoke.mjs), which checks both run the same physics.
 *
 *   node tools/sim/update-mujoco.mjs            # latest release
 *   node tools/sim/update-mujoco.mjs 3.17.0     # a specific one
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
const read = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();

const current = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies['@mujoco/mujoco'];
const wanted = process.argv[2] ?? read('npm', ['view', '@mujoco/mujoco', 'version']);
if (!/^\d+\.\d+\.\d+$/.test(wanted)) {
  console.error(`Not a MuJoCo version: ${wanted}`);
  process.exit(1);
}
console.log(`MuJoCo ${current} → ${wanted}`);

run('npm', ['install', '--save-exact', `@mujoco/mujoco@${wanted}`]);

const pyproject = path.join(root, 'electron', 'trainer', 'pyproject.toml');
fs.writeFileSync(pyproject, fs.readFileSync(pyproject, 'utf8').replace(/"mujoco==[^"]+"/, `"mujoco==${wanted}"`));
run('uv', ['lock', '--project', 'electron/trainer']);
// Install it in the trainer's environment now, so the smoke test (and the next training run) use it
run('uv', ['sync', '--project', 'electron/trainer', '--frozen'], { env: { ...process.env, UV_PROJECT_ENVIRONMENT: path.join(root, 'library', 'trainer-env') } });

run('node', ['tools/sim/smoke.mjs']);
console.log(`
Updated to MuJoCo ${wanted}. Before committing:
  - Read the changelog for breaking changes: https://mujoco.readthedocs.io/en/latest/changelog.html
  - npm run build, then open a robot's Simulate tab and press Simulate
  - Policies trained on ${current} still run; retrain if the changelog touches contacts or actuators`);
