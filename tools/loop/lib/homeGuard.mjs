import fs from 'node:fs';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';

const FILE = path.join(LOOP_DIR, 'state', 'home-guard.json');

export const LOAD_CHECK = [
  "import fs from 'node:fs';",
  "const dirs = ['tools/loop/lib', 'tools/loop/lanes'];",
  "const files = dirs.flatMap((dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).map((f) => `${process.cwd()}/${dir}/${f}`));",
  'for (const file of files) await import(file);',
].join('\n');

const read = () => {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { bad: [] };
  }
};

const write = (state) => {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state));
};

export const isBad = (sha) => read().bad.includes(sha);

export function markBad(sha) {
  const state = read();

  write({ ...state, bad: [...new Set([...state.bad, sha])].slice(-20) });
}

export const firstLine = (text) =>
  String(text)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /Error|error:/.test(line)) ?? String(text).trim().split('\n')[0];
