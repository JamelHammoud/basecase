import { execFile } from 'node:child_process';
import { findOnPath } from '../../electron/executables.mjs';

export function nativeContactReplay(replay, version) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      findOnPath('uv'),
      ['run', '--no-project', '--with', `mujoco-core==${version}`, 'python', 'tools/sim/contactReference.py'],
      { maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return reject(error);

        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(e);
        }
      },
    );

    child.stdin.end(JSON.stringify([replay]));
  });
}
