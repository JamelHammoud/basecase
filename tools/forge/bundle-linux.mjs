import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { forgeMujocoVersion } from './mujocoVersion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const version = forgeMujocoVersion();
const vendor = process.env.FORGE_MUJOCO_DIR ?? path.join(root, 'forge', 'vendor', `mujoco-${version}`);
const files = [
  ['forge-train', path.join(root, 'forge', 'target', 'release', 'forge-train')],
  [`libmujoco.so.${version}`, path.join(vendor, 'lib', `libmujoco.so.${version}`)],
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encoded = files.map(([name, file]) => {
  const bytes = fs.readFileSync(file);

  return { name, sha256: hash(bytes), data: bytes.toString('base64') };
});
const out = path.join(root, 'forge', 'dist-linux-x64');
const name = 'forge-linux-x64.json';
const bytes = Buffer.from(JSON.stringify({ format: 'basecase-forge-linux-x64', files: encoded }));

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, name), bytes);
fs.writeFileSync(path.join(out, `${name}.sha256`), `${hash(bytes)}  ${name}\n`);
