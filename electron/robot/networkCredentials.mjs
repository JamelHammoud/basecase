import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isPairingKey, robotId } from './networkIdentity.mjs';

export { isPairingKey } from './networkIdentity.mjs';

const endpointName = ({ host, port }) => `${host}:${port}`;
const INVALID_PAIRING = 'Check the robot’s address and pairing code.';

function readRecord(file) {
  try {
    if (fs.statSync(file).size > 256) return null;

    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeRecord(file, value) {
  const staged = `${file}.part`;

  fs.writeFileSync(staged, JSON.stringify(value), { mode: 0o600 });
  fs.chmodSync(staged, 0o600);
  fs.renameSync(staged, file);
}

export class NetworkCredentials {
  constructor(folder) {
    this.folder = folder;
    this.keys = new Map();
    this.aliases = new Map();
  }

  file(endpoint) {
    const name = createHash('sha256').update(endpointName(endpoint)).digest('hex');

    return path.join(this.folder, `endpoint-${name}.json`);
  }

  identityFile(id) {
    return path.join(this.folder, `robot-${id}.json`);
  }

  keyOf(id) {
    if (!isPairingKey(id)) return null;

    const remembered = this.keys.get(id);

    if (remembered || !this.folder) return remembered ?? null;

    const record = readRecord(this.identityFile(id));

    return record?.id === id && robotId(record.key) === id ? record.key : null;
  }

  aliasOf(endpoint) {
    const remembered = this.aliases.get(endpointName(endpoint));

    if (remembered || !this.folder) return remembered ?? null;

    return readRecord(this.file(endpoint))?.id ?? null;
  }

  read(endpoint, address = endpoint.host) {
    if (endpoint.id !== undefined) return this.keyOf(endpoint.id);

    const id = this.aliasOf(endpoint) ?? this.aliasOf({ host: address, port: endpoint.port });

    return this.keyOf(id);
  }

  save(endpoint, key, address = endpoint.host) {
    const id = robotId(key);

    if (!id || (endpoint.id !== undefined && endpoint.id !== id)) throw new Error(INVALID_PAIRING);

    const aliases = new Map(
      [endpoint, { host: address, port: endpoint.port }].map((alias) => [endpointName(alias), alias]),
    );

    this.persist(id, key, aliases);
    this.keys.set(id, key);

    for (const name of aliases.keys()) this.aliases.set(name, id);
  }

  persist(id, key, aliases) {
    if (!this.folder) return;

    fs.mkdirSync(this.folder, { recursive: true, mode: 0o700 });
    writeRecord(this.identityFile(id), { id, key });

    for (const alias of aliases.values()) writeRecord(this.file(alias), { id });
  }
}
