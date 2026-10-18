import fs from 'node:fs';
import path from 'node:path';

export function readJsonRecords(dir, suffix) {
  const records = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(suffix))) {
    try {
      records.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')));
    } catch {}
  }

  return records;
}

export const newestFirst = (field) => (a, b) => (b[field] || '').localeCompare(a[field] || '');
