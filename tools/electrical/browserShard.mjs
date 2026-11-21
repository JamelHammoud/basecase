import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BaseSequencer } from 'vitest/node';

export async function browserShard(files, shard) {
  const [index, count] = shard.split('/').map(Number);
  const root = process.cwd().replaceAll('\\', '/');
  const sequencer = new BaseSequencer({ config: { root, shard: { index, count } } });
  const specifications = files.map((file) => ({ moduleId: path.resolve(file).replaceAll('\\', '/') }));

  return (await sequencer.shard(specifications)).map((specification) => specification.moduleId);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const inventory = execFileSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'list', '--config', 'vitest.e2e.config.ts', '--filesOnly'],
    { encoding: 'utf8', windowsHide: true },
  );
  const selected = await browserShard(inventory.trim().split(/\r?\n/u).filter(Boolean), process.argv[2]);

  process.stdout.write(selected.join('\n'));
}
