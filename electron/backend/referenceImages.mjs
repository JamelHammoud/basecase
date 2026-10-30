import fs from 'node:fs';
import path from 'node:path';

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export class ReferenceImages {
  constructor(referencesDir) {
    this.referencesDir = referencesDir;
    this.next = undefined;
    this.byLane = new Map();
  }

  ofLane(lane) {
    return [...(this.byLane.get(lane) ?? [])];
  }

  remember(lane, name) {
    if (!lane) return;

    const names = this.byLane.get(lane) ?? [];

    if (!names.includes(name)) names.push(name);

    this.byLane.set(lane, names);
  }

  nextNumber() {
    if (this.next === undefined) {
      const used = fs.readdirSync(this.referencesDir).map((f) => Number(/^ref-(\d+)\./.exec(f)?.[1] ?? 0));

      this.next = Math.max(0, ...used) + 1;
    }

    return this.next++;
  }

  save(mime, base64, lane) {
    try {
      const ext = EXTENSIONS[mime] ?? 'png';
      const name = `ref-${this.nextNumber()}`;

      fs.writeFileSync(path.join(this.referencesDir, `${name}.${ext}`), Buffer.from(base64, 'base64'));
      this.remember(lane, name);

      return name;
    } catch {
      return null;
    }
  }
}
