import { spawn } from 'node:child_process';
import { FILE_LIMIT } from './diagnosticContract.mjs';

export async function diagnosticJobLog({ repository, id }, launch = spawn) {
  const child = launch('gh', ['api', `repos/${repository}/actions/jobs/${id}/logs`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
    windowsHide: true,
  });
  let tail = Buffer.alloc(0);

  child.stderr.resume();
  child.stdout.on('data', (chunk) => {
    tail = Buffer.concat([tail, chunk]).subarray(-FILE_LIMIT);
  });
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Job log could not be retrieved'));

        return;
      }

      resolve();
    });
  });

  return tail;
}
