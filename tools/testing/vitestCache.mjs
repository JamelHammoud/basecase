import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function toolIdentity(configUrl) {
  const require = createRequire(configUrl);
  const tools = ['vite', 'vitest'].map((name) => {
    const file = require.resolve(`${name}/package.json`);

    return [readFileSync(file, 'utf8'), statSync(file).mtimeMs];
  });

  return createHash('sha256')
    .update(JSON.stringify([process.versions, tools]))
    .digest('hex')
    .slice(0, 16);
}

function claimSlot(directory) {
  mkdirSync(directory, { recursive: true });

  for (let slot = 0; ; slot++) {
    const lease = path.join(directory, `${slot}.lease`);
    let descriptor;

    try {
      descriptor = openSync(lease, 'wx');
    } catch (error) {
      if (error.code === 'EEXIST') continue;

      throw error;
    }

    closeSync(descriptor);
    process.once('exit', () => rmSync(lease, { force: true }));

    return path.join(directory, String(slot));
  }
}

export function vitestCache(configUrl) {
  const config = fileURLToPath(configUrl);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const directory = path.join(root, 'scratch', 'vitest', path.relative(root, config), toolIdentity(configUrl));
  const slot = claimSlot(directory);

  return {
    cacheDir: path.join(slot, 'vite'),
    test: { fsModuleCachePath: path.join(slot, 'modules') },
  };
}
