import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { publicFetch, readCapped } from '../publicFetch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAX_BYTES = 128 * 1024 * 1024;

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const NAME = 'forge-linux-x64.json';

function elf64(bytes) {
  return (
    bytes.length >= 20 &&
    bytes.subarray(0, 6).equals(Buffer.from([127, 69, 76, 70, 2, 1])) &&
    bytes.readUInt16LE(18) === 62
  );
}

export function readBundle(text) {
  const bundle = JSON.parse(text);

  if (bundle.format !== 'basecase-forge-linux-x64' || !Array.isArray(bundle.files) || bundle.files.length !== 2)
    throw new Error('The Linux trainer bundle has the wrong format.');

  const files = {};

  for (const file of bundle.files) {
    if (
      typeof file?.name !== 'string' ||
      !/^(forge-train|libmujoco\.so\.\d+\.\d+\.\d+)$/.test(file.name) ||
      files[file.name]
    )
      throw new Error('The Linux trainer bundle names an unsupported file.');

    const bytes = Buffer.from(String(file.data), 'base64');

    if (!bytes.length || bytes.length > MAX_BYTES || sha256(bytes) !== file.sha256 || !elf64(bytes))
      throw new Error('The Linux trainer bundle failed verification.');

    files[file.name] = bytes;
  }

  if (!files['forge-train'] || !Object.keys(files).some((name) => name.startsWith('libmujoco.')))
    throw new Error('The Linux trainer bundle is incomplete.');

  return files;
}

export async function linuxBundle({ fetchFn = publicFetch, resources = process.resourcesPath } = {}) {
  const local = [resources && path.join(resources, 'forge', NAME), path.join(root, 'forge', 'dist-linux-x64', NAME)]
    .filter(Boolean)
    .find((file) => fs.existsSync(file));

  if (local && fs.statSync(local).size > MAX_BYTES) throw new Error('The Linux trainer bundle exceeds 128 MB.');

  if (local) return readBundle(fs.readFileSync(local, 'utf8'));

  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const base = `https://github.com/JamelHammoud/basecase/releases/download/v${version}/`;
  const response = await fetchFn(`${base}${NAME}`);

  if (!response.ok) throw new Error('Couldn’t download the Linux trainer for this studio version.');

  const bytes = await readCapped(response, MAX_BYTES, 'The Linux trainer');
  const checksumResponse = await fetchFn(`${base}${NAME}.sha256`);

  if (!checksumResponse.ok) throw new Error('Couldn’t download the Linux trainer checksum.');

  const checksum = (await readCapped(checksumResponse, 1024, 'The Linux trainer checksum')).toString('utf8').trim();

  if (checksum !== `${sha256(bytes)}  ${NAME}`) throw new Error('The Linux trainer download failed verification.');

  return readBundle(bytes.toString('utf8'));
}
