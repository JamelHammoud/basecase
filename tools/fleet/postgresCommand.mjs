import { spawn } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';

export async function postgresCommand(command, args, log) {
  const output = await open(log, 'a');

  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', output.fd, output.fd] });

      child.once('error', reject);
      child.once('exit', resolve);
    });

    if (code !== 0) throw new Error(`PostgreSQL command exited ${code}: ${(await readFile(log, 'utf8')).slice(-8000)}`);
  } finally {
    await output.close();
  }
}
