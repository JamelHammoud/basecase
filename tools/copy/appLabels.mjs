import fs from 'node:fs';
import path from 'node:path';
import { chordsOf, shortcutIds } from '../../electron/shortcutKeys.mjs';
import { literalsOf } from './extract.mjs';
import { LABEL_EXCEPTIONS } from './labelExceptions.mjs';
import { labelIndex } from './labels.mjs';

const SOURCE = /\.(ts|tsx)$/;
const MAIN_PROCESS = /^[^/]+\.mjs$/;
const SKIPPED = /\.d\.ts$|\.(test|spec|e2e)\.[mt]sx?$|(^|\/)(__tests__|fixtures?)\//;

export const MENU_ROLE_LABELS = [
  'Services',
  'Hide Others',
  'Show All',
  'Cut',
  'Copy',
  'Paste',
  'Enter Full Screen',
  'Window',
  'Minimize',
  'Zoom',
  'Bring All to Front',
  'Help',
];

const filesIn = (root, folder, { recursive, pattern }) =>
  fs
    .readdirSync(path.join(root, folder), { recursive })
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => pattern.test(file) && !SKIPPED.test(file))
    .map((file) => `${folder}/${file}`);

const appFiles = (root) => [
  ...filesIn(root, 'src', { recursive: true, pattern: SOURCE }),
  ...filesIn(root, 'electron', { recursive: false, pattern: MAIN_PROCESS }),
];

const literals = (root, file) => literalsOf(fs.readFileSync(path.join(root, file), 'utf8'), file);

export const shortcutKeys = () => shortcutIds().flatMap(chordsOf);

export function appLabels(root) {
  const strings = appFiles(root).flatMap((file) => literals(root, file));

  return labelIndex({
    strings: [...strings, ...MENU_ROLE_LABELS],
    keys: shortcutKeys(),
    exceptions: LABEL_EXCEPTIONS,
  });
}
