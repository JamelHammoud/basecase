import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORGE_FETCH, forgeMujocoVersion } from '../forge/mujocoVersion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
const read = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const current = pkg.devDependencies['@mujoco/mujoco'] ?? pkg.dependencies['@mujoco/mujoco'];
const wanted = process.argv[2] ?? read('npm', ['view', '@mujoco/mujoco', 'version']);

if (!/^\d+\.\d+\.\d+$/.test(wanted)) {
  console.error(`Not a MuJoCo version: ${wanted}`);
  process.exit(1);
}

console.log(`MuJoCo ${current} → ${wanted} (Forge ${forgeMujocoVersion()})`);

run('npm', ['install', '--save-exact', `@mujoco/mujoco@${wanted}`]);

const pyproject = path.join(root, 'electron', 'trainer', 'pyproject.toml');

fs.writeFileSync(
  pyproject,
  fs.readFileSync(pyproject, 'utf8').replace(/"mujoco(-core)?==[^"]+"/, `"mujoco-core==${wanted}"`),
);
run('uv', ['lock', '--project', 'electron/trainer']);
run('uv', ['sync', '--project', 'electron/trainer', '--frozen'], {
  env: { ...process.env, UV_PROJECT_ENVIRONMENT: path.join(root, 'library', 'trainer-env') },
});

const fetchRs = path.join(root, FORGE_FETCH);

fs.writeFileSync(
  fetchRs,
  fs
    .readFileSync(fetchRs, 'utf8')
    .replace(/pub const VERSION: &str = "[^"]+";/, `pub const VERSION: &str = "${wanted}";`),
);

run('node', ['tools/sim/smoke.mjs']);
console.log(`
Updated the app, the trainer and Forge to MuJoCo ${wanted}. Before committing:
  - Read the release notes for breaking changes: https://github.com/google-deepmind/mujoco/releases/tag/${wanted}
  - cargo build --release --manifest-path forge/Cargo.toml (downloads the C library into forge/vendor/mujoco-${wanted})
  - Run every gate that touches physics (docs/guide/simulate.md lists them)
  - npm run build, then open a robot's Simulate tab and press Simulate
  - Policies trained on ${current} still run; retrain if the release notes touch contacts or actuators`);
