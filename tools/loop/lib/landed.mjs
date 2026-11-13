import fs from 'node:fs';
import path from 'node:path';
import { blocksOf, sentencesOf } from '../../site/blocks.mjs';
import { run } from './sh.mjs';

const ENTRY = /^site\/content\/changelog\/[^/]+\.md$/;
const IMAGE = /^site\/public\/.+\.(png|jpe?g|gif|webp)$/i;
const TITLE = /^title:\s*(.+)$/m;

export const NOTHING_LANDED = { entries: [], images: [], exists: () => false };

export function entryLine(file, source) {
  const title = (TITLE.exec(source)?.[1] ?? path.basename(file, '.md')).replace(/^(['"])(.*)\1$/, '$2').trim();
  const opening = blocksOf(source).find((block) => block.kind === 'paragraph');
  const sentence = opening ? (sentencesOf(opening.text)[0] ?? '') : '';

  return `**${title}** (\`${file}\`)${sentence ? `\n${sentence}` : ''}`;
}

export function landedFrom(files, { read, exists }) {
  return {
    entries: files.filter((file) => ENTRY.test(file)).map((file) => entryLine(file, read(file))),
    images: files.filter((file) => IMAGE.test(file)),
    exists,
  };
}

export function landedIn(range, dir) {
  const files = run('git', ['diff', '--name-only', '-z', '--diff-filter=AM', range], { cwd: dir }).out.split('\0');

  return landedFrom(files.filter(Boolean), {
    read: (file) => fs.readFileSync(path.join(dir, file), 'utf8'),
    exists: (file) => fs.existsSync(path.join(dir, file)),
  });
}
