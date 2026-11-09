import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forgeMujocoVersion } from './mujocoVersion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const release = path.join(root, 'forge', 'target', 'release');
const out = path.join(root, 'forge', 'dist');
const MUJOCO = forgeMujocoVersion();
const FRAMEWORK_REF = `@rpath/mujoco.framework/Versions/A/libmujoco.${MUJOCO}.dylib`;
const DYLIB = `libmujoco.${MUJOCO}.dylib`;

function stageMac() {
  const binary = path.join(out, 'forge-train');
  const vendor = process.env.FORGE_MUJOCO_DIR ?? path.join(root, 'forge', 'vendor', `mujoco-${MUJOCO}`);

  fs.copyFileSync(path.join(release, 'forge-train'), binary);
  fs.copyFileSync(path.join(vendor, 'mujoco.framework', 'Versions', 'A', DYLIB), path.join(out, DYLIB));
  execFileSync('install_name_tool', ['-change', FRAMEWORK_REF, `@executable_path/${DYLIB}`, binary]);
  execFileSync('install_name_tool', ['-id', `@executable_path/${DYLIB}`, path.join(out, DYLIB)]);

  for (const file of [path.join(out, DYLIB), binary]) execFileSync('codesign', ['--force', '--sign', '-', file]);
}

function stageWindows() {
  for (const file of ['forge-train.exe', 'mujoco.dll']) fs.copyFileSync(path.join(release, file), path.join(out, file));
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

if (process.platform === 'darwin') stageMac();
else if (process.platform === 'win32') stageWindows();
else fs.copyFileSync(path.join(release, 'forge-train'), path.join(out, 'forge-train'));

console.log(`Staged Forge in ${path.relative(root, out)}: ${fs.readdirSync(out).join(', ')}`);
