import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const FORGE_FETCH = path.join('forge', 'crates', 'forge-mujoco', 'build', 'fetch.rs');

export function forgeMujocoVersion() {
  const source = fs.readFileSync(path.join(root, FORGE_FETCH), 'utf8');
  const version = /pub const VERSION: &str = "([^"]+)";/.exec(source)?.[1];

  if (!version) throw new Error(`No MuJoCo VERSION in ${FORGE_FETCH}`);

  return version;
}
