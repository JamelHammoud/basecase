import path from 'node:path';
import { fail, pass, ROOT, sh, shCheck, vitestCheck } from '../lib/gate.mjs';
import { lockProblems } from '../hw/motorLock.mjs';

const MANIFEST = path.join(ROOT, 'hw', 'Cargo.toml');
const EXE = process.platform === 'win32' ? 'robot-daemon.exe' : 'robot-daemon';
const STAGED = path.join(ROOT, 'hw', 'dist', EXE);
const UNLOCKED_DIR = path.join(ROOT, 'hw', 'target', 'unlocked');
const UNSIGNED = { env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } };

const locked = (binary) => () => {
  const problems = lockProblems(binary);

  return problems.length ? fail(problems.join('\n')) : pass();
};

function unlockedBuildIsCaught() {
  const r = sh('cargo', [
    'build',
    '--release',
    '--manifest-path',
    MANIFEST,
    '-p',
    'robot-daemon',
    '--features',
    'unlock-real-motors',
    '--target-dir',
    UNLOCKED_DIR,
  ]);

  if (!r.ok) return pass(`The unlocked daemon didn't build, so the lock check never saw it: ${r.stderr.slice(-400)}`);

  return locked(path.join(UNLOCKED_DIR, 'release', EXE))();
}

export default {
  id: 's5b-daemon-app',
  stage: 5,
  title: 'The robot daemon inside the app: bundled, locked, heartbeat, faults on screen, a Case driving it',
  state: 'required',
  checks: [
    shCheck('the daemon builds', 'cargo', ['build', '--release', '--manifest-path', MANIFEST, '-p', 'robot-daemon']),
    shCheck('the daemon is staged for the app', 'npm', ['run', 'build:daemon']),
    { name: 'the staged daemon is locked to emulated servos and says hello', run: locked(STAGED) },
    shCheck('the app bundles', 'npx', ['vite', 'build']),
    shCheck(
      'an unsigned app packages',
      'npx',
      ['electron-builder', '--dir', '--publish', 'never', '-c.mac.forceCodeSigning=false'],
      UNSIGNED,
    ),
    vitestCheck(
      'the packaged app ships the locked daemon, spawns it emulated, refuses real ports and untrusted IPC',
      'verify/hw/packaged.test.ts',
    ),
    vitestCheck(
      'heartbeat, the ladder, status, faults, refusals and a lost daemon reach the user',
      'verify/hw/daemonUi.test.ts',
    ),
    vitestCheck(
      'a Case drives the emulated robot through the daemon and back to the screen',
      'verify/hw/caseDrive.test.ts',
    ),
  ],
  canaries: [
    vitestCheck('an app that skips the heartbeat is caught', 'verify/hw/canaryHeartbeat.test.ts'),
    vitestCheck('a UI that hides a fault is caught', 'verify/hw/canaryHiddenFault.test.ts'),
    { name: 'a daemon built with unlock-real-motors is caught', run: unlockedBuildIsCaught },
  ],
};
