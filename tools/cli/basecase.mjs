#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createJiti } from 'jiti';
import { isSafeFileId } from '../../electron/backend/constants.mjs';
import { installRobot } from '../../electron/robot/robotInstall.mjs';

process.noDeprecation = true;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USAGE =
  'Usage: basecase check <scene.basecase> [--case <id>] [--json] | basecase export <scene.basecase> --package <dir> | basecase robot install <user@host> [--package <dir> | --scene <scene.basecase>] [--family <family>] [--key <file>] [--pairing-code <code>]';
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
      options: {
        case: { type: 'string' },
        json: { type: 'boolean' },
        package: { type: 'string' },
        scene: { type: 'string' },
        key: { type: 'string' },
        'pairing-code': { type: 'string' },
        family: { type: 'string' },
      },
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

  if (command === 'robot') return installComputer(positionals, values);

  globalThis.fetch = () => Promise.reject(new Error('offline'));

  if (!file || extra.length) throw new Unreadable(USAGE);

  if (command === 'check') return check(file, values);

  if (command === 'export') return exportPackage(file, values.package);

  throw new Unreadable(USAGE);
}

async function installComputer(positionals, values) {
  const [, command, target, ...extra] = positionals;

  if (command !== 'install' || !target || extra.length || (values.scene && values.package)) throw new Unreadable(USAGE);

  const jointMap = await installationMap(values);
  const spec = await installationFamily(jointMap, values.family);
  const result = await installRobot({
    target,
    jointMap,
    emulated: true,
    ...(spec ? { spec } : {}),
    ...(values.key ? { key: path.resolve(values.key) } : {}),
    ...(values['pairing-code'] ? { pairingCode: values['pairing-code'] } : {}),
  });

  if (!result.ok) throw new Unreadable(result.message);

  if (values.json) console.log(JSON.stringify(result));

  if (!values.json)
    console.log(
      `Robot computer: ${result.host}:${result.port}\n${result.pairingCode ? `Pairing code: ${result.pairingCode}` : 'Already paired. Connect from the paired computer.'}`,
    );

  return EXIT.passed;
}

async function installationFamily(jointMap, family) {
  if (!family) return null;

  if (family === 'unitree-g1') return { family, emulated: true };

  if (family === 'ros2') {
    const { ros2Ask } = await load('src/robot/ros2.ts');

    return ros2Ask(jointMap.joints.map((joint) => ({ name: joint.joint ?? joint.name, id: joint.name })));
  }

  if (!['feetech', 'dynamixel'].includes(family))
    throw new Unreadable('Choose feetech, dynamixel, unitree-g1 or ros2.');

  return { family, emulated: true, ids: jointMap.joints.map(({ id }) => id), class: jointMap.class };
}

async function installationMap(values) {
  if (values.scene) {
    const { scenePackageFiles } = await load('src/sim/robotPackage/scenePackage.ts');
    const scene = await readScene(values.scene);
    const files = await scenePackageFiles(scene, meshFiles(scene.parts));

    return JSON.parse(new TextDecoder().decode(files['joint_map.json']));
  }

  try {
    const file = path.join(path.resolve(values.package ?? '.'), 'joint_map.json');

    if (fs.statSync(file).size > 2 * 1024 * 1024) throw new Error('The joint map is larger than 2 MB.');

    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Unreadable(`Couldn’t read the Robot Package’s joint_map.json: ${error.message}`);
  }
}

const exit = (code) => process.stdout.write('', () => process.exit(code));

main(process.argv.slice(2)).then(exit, (error) => {
  const message = error instanceof Unreadable ? error.message : error.stack;

  process.stderr.write(`${message}\n`, () => exit(EXIT.unreadable));
});
