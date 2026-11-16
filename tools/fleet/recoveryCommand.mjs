import { spawn } from 'node:child_process';

export function recoveryCommand(url, command, org, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/fleet/service/main.mjs', command, org], {
      env: { ...process.env, FLEET_DATABASE_URL: url },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') reject(error);
    });
    child.stdin.end(input === undefined ? '' : JSON.stringify(input));
  });
}
