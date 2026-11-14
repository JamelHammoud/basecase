import fs from 'node:fs';
import path from 'node:path';
import { kindOf, rewriteFile, voiceText } from '../../voice/voice.mjs';
import { run } from './sh.mjs';

const off = () => Boolean(process.env.VITEST) || process.env.BASECASE_VOICE === 'off';

export function voiceChangedPosts(dir, log = () => {}) {
  if (off()) return [];

  const changed = run('git', ['diff', '--name-only', '--diff-filter=AM', 'origin/main', '--', 'site/content'], {
    cwd: dir,
    allowFail: true,
  })
    .out.split('\n')
    .filter((file) => file && kindOf(file) && fs.existsSync(path.join(dir, file)));

  for (const file of changed) log(`${file}: ${rewriteFile(file, { cwd: dir }) ? 'voiced' : 'left as written'}`);

  return changed;
}

export const voiced = (text, kind) => (off() || !text?.trim() ? text : (voiceText(text, { kind }) ?? text));
