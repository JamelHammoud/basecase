import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { build } from 'rolldown';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { xmlConnections } from './netlist.mjs';
import { checkBoard } from './boardCheck.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'scratch', 'electrical', 'acceptance');
const image = 'kicad/kicad:9.0.6';
const docker = process.argv.includes('--docker');
const exportOnly = process.argv.includes('--export-only');

function cli(args, dir, tool = 'kicad-cli') {
  const command = docker ? 'docker' : tool;
  const inputs = docker
    ? [
        'run',
        '--rm',
        '--platform',
        'linux/amd64',
        '--user',
        '0:0',
        '--volume',
        `${dir}:/work`,
        '--workdir',
        '/work',
        '--entrypoint',
        tool,
        image,
        ...args,
      ]
    : args;
  const result = spawnSync(command, inputs, {
    cwd: dir,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });

  assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`);

  return result.stdout.trim();
}

async function validate(dir, expected) {
  cli(['sch', 'export', 'netlist', 'robot.kicad_sch', '--format', 'kicadxml', '--output', 'robot.net'], dir);
  cli(['sch', 'erc', 'robot.kicad_sch', '--format', 'json', '--output', 'erc.json'], dir);

  const groups = xmlConnections(await fs.readFile(path.join(dir, 'robot.net'), 'utf8'));
  const erc = JSON.parse(await fs.readFile(path.join(dir, 'erc.json'), 'utf8'));

  assert.deepEqual(groups, expected);
  assert.equal(erc.kicad_version, '9.0.6');
  assert.equal(erc.sheets.flatMap((sheet) => sheet.violations).length, 0);
}

async function negativeControls(dir, fixture) {
  const schematic = fixture.files['robot.kicad_sch'];
  const labels = schematic.split('\n');
  const ground = labels.findIndex((line) => line.trimStart().startsWith('(label "GROUND_'));

  assert.ok(ground >= 0);
  labels.splice(ground, 1);
  await fs.writeFile(path.join(dir, 'robot.kicad_sch'), labels.join('\n'));
  cli(['sch', 'erc', 'robot.kicad_sch', '--format', 'json', '--output', 'missing-ground.json'], dir);

  const erc = JSON.parse(await fs.readFile(path.join(dir, 'missing-ground.json'), 'utf8'));

  assert.ok(erc.sheets.flatMap((sheet) => sheet.violations).length > 0);
  await fs.writeFile(path.join(dir, 'robot.kicad_sch'), schematic.replace('(label "POSITIVE_0"', '(label "GROUND_0"'));
  cli(['sch', 'export', 'netlist', 'robot.kicad_sch', '--format', 'kicadxml', '--output', 'reversed.net'], dir);
  assert.notDeepEqual(
    xmlConnections(await fs.readFile(path.join(dir, 'reversed.net'), 'utf8')),
    fixture.expected.groups,
  );
  await fs.writeFile(path.join(dir, 'robot.kicad_sch'), schematic);
}

async function checkFixture(fixture) {
  const dir = path.join(output, fixture.name);
  const board = await checkBoard({ fixture, dir, cli, exportOnly, root });

  await fs.mkdir(dir, { recursive: true });

  for (const [file, text] of Object.entries(fixture.files)) await fs.writeFile(path.join(dir, file), text);

  assert.deepEqual(fixture.bytes, fixture.reopened);

  const files = unzipSync(fixture.bytes);
  const report = JSON.parse(strFromU8(files['robot/requirements.json']));

  assert.equal(report.sourceFingerprint, createHash('sha256').update(files['robot/source.json']).digest('hex'));
  assert.equal(report.projection.completeness, 'draft');
  assert.equal(report.projection.electricalVerdict, 'not-established');
  assert.ok(report.projection.requirements.length);
  assert.ok(report.projection.nets.every((net) => net.transientA === null));
  assert.ok(fixture.negativeControls.wrongPins.some((requirement) => requirement.code === 'pin-map-mismatch'));

  if (fixture.name !== 'battery-rover')
    assert.ok(
      fixture.negativeControls.highSupply.some(
        (requirement) => requirement.code === 'rail-voltage' || requirement.code === 'conflicting-rail',
      ),
    );

  const busRail = report.projection.nets.find((net) => net.function === 'positive' && net.bus === 0);

  assert.equal(busRail.nominalV, fixture.expected.expectedServoVolts);

  if (exportOnly) return { name: fixture.name, bytes: fixture.bytes.length, board, validation: 'export-only' };

  await validate(dir, fixture.expected.groups);

  if (fixture.name === 'tethered-so101') await negativeControls(dir, fixture);

  return {
    board,
    name: fixture.name,
    bytes: fixture.bytes.length,
    validation: 'KiCad 9.0.6 ERC and independent netlist',
    nets: fixture.expected.groups.length,
  };
}

async function main() {
  await fs.mkdir(output, { recursive: true });

  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'basecase electrical fixtures '));

  try {
    const bundle = path.join(temporary, 'fixtures.mjs');

    await build({
      input: path.join(root, 'tools/electrical/fixtures.ts'),
      platform: 'node',
      transform: { define: { 'import.meta.env.MODE': '"production"', 'import.meta.env.BASE_URL': '"/"' } },
      plugins: [
        {
          name: 'electrical-node-asset',
          resolveId: (id) =>
            id === 'manifold-3d/manifold.wasm?url' ? path.join(root, 'tools/cli/assetUrl.mjs') : null,
        },
      ],
      output: { file: bundle, format: 'esm', codeSplitting: false },
    });

    const { acceptanceFixtures } = await import(pathToFileURL(bundle).href);
    const selectedName = process.argv.includes('--fixture')
      ? process.argv[process.argv.indexOf('--fixture') + 1]
      : undefined;
    const fixtures = await acceptanceFixtures(selectedName);

    assert.equal(fixtures.length, selectedName ? 1 : 10);

    if (!exportOnly) assert.equal(cli(['version'], output), '9.0.6');

    const results = [];

    for (const fixture of fixtures) results.push(await checkFixture(fixture));

    await fs.writeFile(path.join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(results)}\n`);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

await main();
