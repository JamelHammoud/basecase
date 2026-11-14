import fs from 'node:fs';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';

export function store(kind, defaults) {
  const dir = path.join(LOOP_DIR, 'state', kind);
  const fileFor = (number) => path.join(dir, `${number}.json`);

  const read = (number) => {
    try {
      return JSON.parse(fs.readFileSync(fileFor(number), 'utf8'));
    } catch {
      return {};
    }
  };

  const get = (number) => ({ ...structuredClone(defaults), ...read(number) });

  const save = (number, entry) => {
    const tmp = `${fileFor(number)}.${process.pid}`;

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(entry));
    fs.renameSync(tmp, fileFor(number));

    return entry;
  };

  const all = () => {
    try {
      return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => ({ ...get(path.basename(file, '.json')), key: path.basename(file, '.json') }));
    } catch {
      return [];
    }
  };

  return { get, save, all, update: (number, change) => save(number, { ...get(number), ...change(get(number)) }) };
}
