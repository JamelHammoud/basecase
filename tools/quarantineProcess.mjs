import { execFileSync, spawn } from 'node:child_process';
import { findOnPath, IS_WINDOWS } from '../electron/executables.mjs';

function descendants(pid) {
  const snapshot = execFileSync(findOnPath('ps'), ['-axo', 'pid=,ppid='], {
    encoding: 'utf8',
    timeout: 1000,
    maxBuffer: 1024 * 1024,
  });
  const processes = snapshot
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const children = [];
  let pending = [pid];

  while (pending.length > 0) {
    const parents = new Set(pending);

    pending = processes.filter(([, parent]) => parents.has(parent)).map(([child]) => child);
    children.push(...pending);
  }

  return children.reverse();
}

function kill(pid) {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;

  if (IS_WINDOWS) {
    execFileSync(findOnPath('taskkill'), ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      timeout: 5000,
      windowsHide: true,
    });

    return;
  }

  try {
    for (const pid of descendants(child.pid)) {
      try {
        kill(pid);
      } catch (error) {
        console.error(`Quarantine descendant cleanup: ${error.message}`);
      }
    }
  } finally {
    kill(-child.pid);
  }
}

export function runQuarantineProcess(args, { cwd, timeoutMs }) {
  if (timeoutMs <= 0) return Promise.resolve({ timedOut: true });

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, BASECASE_QUARANTINE: 'only' },
      detached: !IS_WINDOWS,
      windowsHide: true,
    });
    let timedOut = false;
    const timer = Number.isFinite(timeoutMs)
      ? setTimeout(() => {
          timedOut = true;

          try {
            stop(child);
          } catch (error) {
            console.error(`Quarantine process cleanup: ${error.message}`);

            if (IS_WINDOWS) child.kill();
            else child.kill('SIGKILL');
          }
        }, timeoutMs)
      : undefined;

    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ timedOut, error: error.message });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ timedOut, code });
    });
  });
}
