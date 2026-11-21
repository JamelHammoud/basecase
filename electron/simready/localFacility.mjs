import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findUv, UV_MISSING } from '../uv.mjs';
import { runConverter } from './converter.mjs';
import { isSafeFileId } from '../backend/constants.mjs';

export function checkedPackage(files) {
  if (!Array.isArray(files) || !files.length || files.length > 256)
    throw new Error('Choose up to 256 local facility files');

  const names = new Set();
  let bytes = 0;

  return files.map((file) => {
    if (
      typeof file.name !== 'string' ||
      !/^[\w .@+/-]{1,240}$/.test(file.name) ||
      file.name.split('/').some((part) => !portableSegment(part))
    )
      throw new Error('Include only local facility files');

    if (
      typeof file.base64 !== 'string' ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64) ||
      names.has(file.name.toLowerCase())
    )
      throw new Error('Include each facility file once');

    const data = Buffer.from(file.base64, 'base64');

    bytes += data.length;
    names.add(file.name.toLowerCase());

    if (bytes > 32 * 1024 * 1024) throw new Error('Choose facility files under 32 MB');

    return { name: file.name, bytes: data };
  });
}

export const localFacilityEnvironment = () =>
  process.env.FLEET_USD_ENV_DIRECTORY ?? path.join(os.homedir(), '.cache', 'basecase', 'fleet-usd-env');

export async function convertLocalFacility(files, options = {}) {
  const checked = checkedPackage(files);
  const roots = checked.filter(
    (file) => /\.(usd|usda|usdc|usdz)$/i.test(file.name) && (!options.root || file.name === options.root),
  );

  if (roots.length !== 1) throw new Error('Choose a local USD or USDZ facility');

  const uv = findUv();

  if (!uv) throw new Error(UV_MISSING);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'basecase-facility-'));
  const raw = path.join(directory, 'files');
  const out = path.join(directory, 'model');

  try {
    await mkdir(out, { recursive: true });

    for (const file of checked) {
      const target = path.join(raw, file.name);

      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.bytes);
    }

    await runConverter({
      uv,
      envDir: options.envDir ?? localFacilityEnvironment(),
      root: path.join(raw, roots[0].name),
      out,
      say: () => {},
      localPackage: true,
    });

    const model = JSON.parse(await readFile(path.join(out, 'model.json'), 'utf8'));
    const visualPath = path.join(out, 'visual.glb');

    if ((await stat(visualPath)).size > 32 * 1024 * 1024) throw new Error('Choose a smaller USD facility');

    const bytes = await readFile(visualPath);

    if (bytes.length > 32 * 1024 * 1024) throw new Error('Choose a smaller USD facility');

    return { base64: bytes.toString('base64'), sourceFrame: model.sourceFrame };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function portableSegment(part) {
  if (!part || part === '.' || part === '..' || /[. ]$/.test(part)) return false;

  const stem = part.split('.')[0].trim();

  return !/^[\w-]+$/.test(stem) || isSafeFileId(stem);
}
