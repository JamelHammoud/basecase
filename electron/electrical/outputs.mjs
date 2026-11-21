import fs from 'node:fs/promises';
import path from 'node:path';
import { BOARD_OUTPUT_LIMIT } from '../../src/wiring/boardNativeContract.mjs';

export async function checkedOutput(directory, filename) {
  const file = path.join(directory, filename);
  const stat = await fs.lstat(file);

  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > (filename === 'drc.json' ? 4 * 1024 * 1024 : BOARD_OUTPUT_LIMIT)
  )
    throw new Error('board-validation');

  return fs.readFile(file, 'utf8');
}

export function reproducibleNativeText(text, directory) {
  const portable = text.split(directory).join('').split(directory.replaceAll('\\', '/')).join('');

  return portable
    .replace(/(CreationDate,)[^*\r\n]+/gu, '$12000-01-01T00:00:00+00:00')
    .replace(/("(?:date|CreationDate)"\s*:\s*")[^"]+("|$)/gu, '$12000-01-01T00:00:00Z$2')
    .replace(/(Created on |Generation date: )[^\r\n]+/gu, '$12000-01-01T00:00:00Z')
    .replace(/(G04 Created by KiCad \(PCBNEW 9\.0\.6\) date )[^\r\n]+/gu, '$12000-01-01 00:00:00*')
    .replace(/(; DRILL file \{KiCad 9\.0\.6\} date )[^\r\n]+/gu, '$12000-01-01T00:00:00+0000');
}

export async function fabricationOutputs(directory) {
  const entries = await fs.readdir(directory);
  const files = {};
  let bytes = 0;

  for (const name of entries.sort()) {
    if (
      !/^robot-(?:F_Cu|B_Cu|F_Mask|B_Mask|f_silkscreen|b_silkscreen|Edge_Cuts)\.gbr$|^robot-(?:PTH|NPTH)\.drl$|^robot-job\.gbrjob$/u.test(
        name,
      )
    )
      throw new Error('board-validation');

    const text = reproducibleNativeText(await checkedOutput(directory, name), path.dirname(directory));

    bytes += Buffer.byteLength(text);

    if (bytes > BOARD_OUTPUT_LIMIT) throw new Error('board-validation');

    files[`fabrication/${name}`] = text;
  }

  if (entries.length !== 10) throw new Error('board-validation');

  return { files, bytes };
}

export function watchBoardOutputs(directory, abort) {
  let pending = Promise.resolve();
  const inspect = async () => {
    const names = await fs.readdir(path.join(directory, 'fabrication')).catch(() => []);
    const files = ['drc.json', ...names.map((name) => path.join('fabrication', name))];
    const stats = await Promise.all(files.map((name) => fs.lstat(path.join(directory, name)).catch(() => null)));
    const bytes = stats.reduce((sum, stat) => sum + (stat?.size ?? 0), 0);

    if (names.length > 16 || bytes > BOARD_OUTPUT_LIMIT || stats.some((stat) => stat?.isSymbolicLink())) abort.abort();
  };
  const timer = setInterval(() => {
    pending = pending.then(inspect).catch(() => abort.abort());
  }, 100);

  return async () => {
    clearInterval(timer);
    await pending;
  };
}
