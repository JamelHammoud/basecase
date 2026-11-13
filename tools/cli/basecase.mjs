#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createJiti } from 'jiti';
import { isSafeFileId } from '../../electron/backend/constants.mjs';

process.noDeprecation = true;
globalThis.fetch = () => Promise.reject(new Error('offline'));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USAGE =
  'Usage: basecase check <scene.basecase> [--case <id>] [--json] | basecase export <scene.basecase> --package <dir>';
const EXIT = Object.freeze({ passed: 0, failed: 1, unreadable: 2 });
const jiti = createJiti(import.meta.url, {
  alias: { 'manifold-3d/manifold.wasm?url': fileURLToPath(new URL('./assetUrl.mjs', import.meta.url)) },
});
const load = (file) => jiti.import(path.join(ROOT, file));

class Unreadable extends Error {}

function readArgs(argv) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: { case: { type: 'string' }, json: { type: 'boolean' }, package: { type: 'string' } },
    });
  } catch {
    throw new Unreadable(USAGE);
  }
}

async function readScene(file) {
  const { decodeSceneFile } = await load('src/utils/sceneFile.ts');

  try {
    return await decodeSceneFile(new Uint8Array(fs.readFileSync(file)));
  } catch (error) {
    throw new Unreadable(error.message);
  }
}

function meshFiles(parts) {
  const ids = new Set(parts.flatMap((p) => (isSafeFileId(p.componentId) ? [p.componentId] : [])));
  const files = {};

  for (const id of ids) {
    const file = path.join(ROOT, 'public', 'parts', `${id}.glb`);

    if (fs.existsSync(file)) files[id] = new Uint8Array(fs.readFileSync(file)).buffer;
  }

  return files;
}

function casesToRun(scene, { sceneCases }, only) {
  let cases;

  try {
    cases = sceneCases(scene);
  } catch (error) {
    throw new Unreadable(error.message);
  }

  const chosen = only ? cases.filter((c) => c.id === only) : cases;

  if (!chosen.length) throw new Unreadable(only ? `No Case ${only} in ${scene.name}.` : `No Cases in ${scene.name}.`);

  return chosen;
}

const row = (check, width) =>
  [
    check.name.padEnd(width),
    `${check.passes} of ${check.runs}`,
    check.margin.toFixed(2).padStart(6),
    check.failed ?? '',
  ]
    .join('  ')
    .trimEnd();

async function check(file, options) {
  const runner = await load('src/cases/sceneCheck.ts');
  const scene = await readScene(file);
  const cases = casesToRun(scene, runner, options.case);
  const { default: loadMujoco } = await import('@mujoco/mujoco');
  const [mj, robot] = await Promise.all([loadMujoco(), runner.sceneRobot(scene, meshFiles(scene.parts))]);
  const width = Math.max(...cases.map((c) => c.name.length));
  const checks = [];

  for (const kase of cases) {
    const result = await runner.checkCase(mj, kase, robot);

    checks.push(result);

    if (!options.json) console.log(row(result, width));
  }

  if (options.json) console.log(JSON.stringify({ cases: checks }, null, 2));

  return checks.some(runner.underBar) ? EXIT.failed : EXIT.passed;
}

function insideDir(dir, relative) {
  const target = path.resolve(dir, relative);

  if (!target.startsWith(dir + path.sep)) throw new Unreadable(`${relative} would leave ${dir}.`);

  return target;
}

async function exportPackage(file, dir) {
  if (!dir) throw new Unreadable(USAGE);

  const { scenePackageFiles } = await load('src/sim/robotPackage/scenePackage.ts');
  const scene = await readScene(file);
  const files = await scenePackageFiles(scene, meshFiles(scene.parts));
  const root = path.resolve(dir);

  for (const [relative, bytes] of Object.entries(files)) {
    const target = insideDir(root, relative);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }

  return EXIT.passed;
}

async function main(argv) {
  const { positionals, values } = readArgs(argv);
  const [command, file, ...extra] = positionals;

  if (!file || extra.length) throw new Unreadable(USAGE);

  if (command === 'check') return check(file, values);

  if (command === 'export') return exportPackage(file, values.package);

  throw new Unreadable(USAGE);
}

const exit = (code) => process.stdout.write('', () => process.exit(code));

main(process.argv.slice(2)).then(exit, (error) => {
  const message = error instanceof Unreadable ? error.message : error.stack;

  process.stderr.write(`${message}\n`, () => exit(EXIT.unreadable));
});
