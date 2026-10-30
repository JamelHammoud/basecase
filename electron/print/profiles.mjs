import fs from 'node:fs';
import path from 'node:path';

const KINDS = ['machine', 'process', 'filament'];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function indexKind(dir) {
  const byName = new Map();

  if (!fs.existsSync(dir)) return byName;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;

    const data = readJson(path.join(dir, file));

    if (data?.name) byName.set(data.name, { file: path.join(dir, file), data });
  }

  return byName;
}

export function loadVendor(profilesDir, vendor) {
  const root = path.join(profilesDir, vendor);
  const meta = readJson(path.join(profilesDir, `${vendor}.json`));

  return {
    vendor,
    meta,
    ...Object.fromEntries(KINDS.map((kind) => [kind, indexKind(path.join(root, kind))])),
  };
}

export function listVendors(profilesDir) {
  return fs
    .readdirSync(profilesDir)
    .filter((f) => f.endsWith('.json') && fs.existsSync(path.join(profilesDir, f.replace(/\.json$/, ''))))
    .map((f) => f.replace(/\.json$/, ''));
}

export function resolvePreset(index, name, seen = new Set()) {
  const entry = index.get(name);

  if (!entry || seen.has(name)) return {};

  seen.add(name);

  const parent = entry.data.inherits ? resolvePreset(index, entry.data.inherits, seen) : {};

  return { ...parent, ...entry.data };
}

export const first = (value) => (Array.isArray(value) ? value[0] : value);

export function parsePoints(value) {
  if (!Array.isArray(value)) return [];

  return value.map((p) => String(p).split('x').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
}

export function slicerVersion(appPath) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');

  if (!fs.existsSync(plist)) return null;

  const text = fs.readFileSync(plist, 'utf8');
  const match = text.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);

  return match?.[1] ?? null;
}
