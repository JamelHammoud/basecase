import fs from 'node:fs';
import path from 'node:path';
import { kindOf, rewriteFile, voiceText } from '../../voice/voice.mjs';
import { run } from './sh.mjs';

const off = () => Boolean(process.env.VITEST) || process.env.BASECASE_VOICE === 'off';

const names = (args, dir) => run('git', args, { cwd: dir, allowFail: true }).out.split('\0').filter(Boolean);

export function newPages(dir) {
  const untracked = names(['ls-files', '-z', '--others', '--exclude-standard', '--', 'site/content'], dir);
  const staged = names(['diff', '-z', '--cached', '--name-only', '--diff-filter=A', 'HEAD', '--', 'site/content'], dir);

  return [...new Set([...untracked, ...staged])]
    .filter((file) => kindOf(file) && fs.existsSync(path.join(dir, file)))
    .sort();
}

export function voiceNewPages(dir, log = () => {}) {
  if (off()) return [];

  const pages = newPages(dir);

  for (const file of pages) log(`${file}: ${rewriteFile(file, { cwd: dir }) ? 'voiced' : 'left as written'}`);

  return pages;
}

export const voiced = (text, kind) => (off() || !text?.trim() ? text : (voiceText(text, { kind }) ?? text));
