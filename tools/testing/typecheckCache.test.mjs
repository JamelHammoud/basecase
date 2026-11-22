import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { root, workspacePair, write } from './vitestCache.fixtures.mjs';

const configs = ['tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.e2e.json'];
const cachePath = (file) =>
  ts.readConfigFile(path.join(root, file), (name) => fs.readFileSync(name, 'utf8')).config.compilerOptions
    .tsBuildInfoFile;
const check = (dir) =>
  spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-b', 'tsconfig.cache.json'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 10000,
  });
let pair;

beforeAll(() => {
  pair = workspacePair();

  for (const [index, dir] of pair.dirs.entries()) {
    write(
      dir,
      'tsconfig.cache.json',
      JSON.stringify({
        compilerOptions: {
          incremental: true,
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          types: [],
          target: 'es2023',
          module: 'esnext',
          tsBuildInfoFile: cachePath(configs[0]),
        },
        files: ['src/cache.ts'],
      }),
    );
    write(dir, 'src/cache.ts', index ? 'export const amount: number = "wrong";' : 'export const amount: number = 1;');
    fs.utimesSync(path.join(dir, 'src/cache.ts'), 1, 1);
    fs.utimesSync(path.join(dir, 'tsconfig.cache.json'), 1, 1);
  }

  const result = check(pair.dirs[0]);

  expect(result.status, result.stdout + result.stderr).toBe(0);
});
afterAll(async () => pair?.close());

it('rejects an older invalid checkout after another worktree populates its shared dependencies', () => {
  const result = check(pair.dirs[1]);

  expect(result.status, result.stdout + result.stderr).not.toBe(0);
  expect(result.stdout).toContain('TS2322');
});

it('keeps all three incremental caches in the owning worktree scratch directory', () => {
  const files = configs.map((file) => path.resolve(pair.dirs[0], cachePath(file)));

  expect(files.every((file) => file.startsWith(path.join(pair.dirs[0], 'scratch') + path.sep))).toBe(true);
  expect(new Set(files).size).toBe(configs.length);
});
