import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KINDS = new Set(['bambu-studio', 'bambu-connect', 'bambu-lan', 'moonraker', 'prusalink', 'octoprint']);
const text = (v, max = 120) => String(v ?? '').slice(0, max);

function cleanConnection(c) {
  if (!c || !KINDS.has(c.kind)) return undefined;

  return {
    kind: c.kind,
    ...(c.host ? { host: text(c.host, 200).trim() } : {}),
    ...(c.serial ? { serial: text(c.serial, 64).trim() } : {}),
  };
}

function cleanCustom(c) {
  const dims = ['width', 'depth', 'height'].map((k) => Number(c?.[k]));

  if (!c || dims.some((n) => !(n > 10 && n < 2000))) return undefined;

  return { width: dims[0], depth: dims[1], height: dims[2] };
}

function cleanPrinter(p) {
  if (!p?.id || !p.modelId) return null;

  return {
    id: text(p.id, 64),
    modelId: text(p.modelId, 80),
    nickname: text(p.nickname || 'Printer', 60),
    nozzle: Number(p.nozzle) > 0 ? Number(p.nozzle) : 0.4,
    ...(cleanConnection(p.connection) ? { connection: cleanConnection(p.connection) } : {}),
    ...(cleanCustom(p.custom) ? { custom: cleanCustom(p.custom) } : {}),
    ...(p.isDefault ? { isDefault: true } : {}),
  };
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function bambuStudioPrinter(
  confFile = path.join(os.homedir(), 'Library', 'Application Support', 'BambuStudio', 'BambuStudio.conf'),
) {
  try {
    const machine = JSON.parse(fs.readFileSync(confFile, 'utf8'))?.presets?.machine;
    const match = /^(.*?) (\d+(?:\.\d+)?) nozzle$/.exec(String(machine ?? ''));

    if (!match) return null;

    const model = match[1];

    return {
      id: `printer-${slug(model)}`,
      modelId: slug(model),
      nickname: model.replace(/^Bambu Lab /, ''),
      nozzle: Number(match[2]),
      connection: { kind: 'bambu-studio' },
      isDefault: true,
    };
  } catch {
    return null;
  }
}

export class PrinterStore {
  constructor(libraryDir, keys) {
    this.file = path.join(libraryDir, 'printers.json');
    this.keys = keys;
  }

  read() {
    try {
      const list = JSON.parse(fs.readFileSync(this.file, 'utf8'));

      return Array.isArray(list) ? list.map(cleanPrinter).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  list() {
    const seeded = fs.existsSync(this.file) ? null : bambuStudioPrinter();

    if (seeded) return this.save([seeded]);

    return this.read().map((p) => ({ ...p, hasSecret: !!this.keys.get(p.id) }));
  }

  save(list) {
    const clean = (Array.isArray(list) ? list : []).map(cleanPrinter).filter(Boolean);
    const ids = new Set(clean.map((p) => p.id));

    for (const old of this.read()) if (!ids.has(old.id)) this.keys.set(old.id, '');

    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(clean, null, 2));

    return this.list();
  }

  get(id) {
    return this.read().find((p) => p.id === id) ?? null;
  }

  setSecret(id, secret) {
    if (!this.get(id)) throw new Error('Add the printer first.');

    this.keys.set(id, secret);

    return { stored: this.keys.canPersist(), hasSecret: !!this.keys.get(id) };
  }

  secret(id) {
    return this.keys.get(id);
  }
}
