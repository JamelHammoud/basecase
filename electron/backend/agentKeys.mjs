import fs from 'node:fs';
import path from 'node:path';

export class AgentKeys {
  constructor({ dir, secrets }) {
    this.file = path.join(dir, 'agent-keys.json');
    this.secrets = secrets;
    this.memory = new Map();
  }

  canPersist() {
    return !!this.secrets?.available();
  }

  readFile() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    } catch {
      return {};
    }
  }

  get(kind) {
    if (this.memory.has(kind)) return this.memory.get(kind);

    const sealed = this.readFile()[kind];

    if (!sealed || !this.canPersist()) return undefined;

    try {
      return this.secrets.decrypt(sealed);
    } catch {
      return undefined;
    }
  }

  set(kind, key) {
    const value = String(key ?? '').trim();
    const stored = this.readFile();

    this.memory.set(kind, value || undefined);

    if (!this.canPersist()) return;

    if (value) stored[kind] = this.secrets.encrypt(value);
    else delete stored[kind];

    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(stored));
    fs.chmodSync(this.file, 0o600);
  }
}
