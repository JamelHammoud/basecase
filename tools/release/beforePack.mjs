import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const stagedDaemon = (projectDir, platform) =>
  path.join(projectDir, 'hw', 'dist', platform === 'win32' ? 'robot-daemon.exe' : 'robot-daemon');

function buildDaemon(projectDir, run) {
  const manifest = path.join(projectDir, 'hw', 'Cargo.toml');

  try {
    run('cargo', ['build', '--release', '--manifest-path', manifest, '-p', 'robot-daemon'], { stdio: 'inherit' });
    run(process.execPath, [path.join(projectDir, 'tools', 'hw', 'stage.mjs')], { stdio: 'inherit' });
  } catch (err) {
    throw new Error(`The robot daemon didn't build, so the app would ship without it: ${err.message}`, { cause: err });
  }
}

export function ensureDaemon({ projectDir, platform, host = process.platform, run = execFileSync }) {
  const staged = stagedDaemon(projectDir, platform);

  if (fs.existsSync(staged)) return staged;

  if (platform !== host) {
    throw new Error(`hw/dist has no robot daemon for ${platform}. Run npm run build:daemon on ${platform} first.`);
  }

  buildDaemon(projectDir, run);

  if (!fs.existsSync(staged)) throw new Error(`npm run build:daemon left no hw/dist/${path.basename(staged)}.`);

  return staged;
}

export default function beforePack(context) {
  ensureDaemon({ projectDir: context.packager.projectDir, platform: context.electronPlatformName });
}
