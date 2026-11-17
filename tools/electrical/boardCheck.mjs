import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkBoardTransforms } from './boardTransforms.mjs';

const moduleIds = new Set(['pololu-d36v50f5', 'pololu-d36v50f6', 'pololu-d36v50f12']);
const powerPads = ['VOUT_1', 'VOUT_2', 'GND1_1', 'GND1_2', 'GND2_1', 'GND2_2', 'VIN_1', 'VIN_2'];
const unusedPads = ['VRP_1', 'VRP_2', 'CONTROL_1', 'CONTROL_2'];
const sourceNode = (part, port, pin) => JSON.stringify([part, port, pin]);

function expectedPads(fixture) {
  const report = JSON.parse(fixture.board.files['requirements.json']);
  const endpoints = new Map(report.projection.endpoints.map((end) => [end.reference, end]));
  const nets = new Map();

  for (const net of report.projection.nets) {
    const group = net.nodes
      .map((node) => {
        const end = endpoints.get(node.reference);

        return sourceNode(end.partId ?? '', end.port, node.pin);
      })
      .sort();

    assert.ok(
      fixture.expected.groups.some((expected) => JSON.stringify([...expected].sort()) === JSON.stringify(group)),
    );
    group.forEach((node) => nets.set(node, net.name));
  }

  return fixture.board.snapshot.parts
    .flatMap((part) => {
      if (part.componentId === 'dynamixel-xl330-m288')
        return ['1', '2', '3'].map((pad) => ({
          reference: `BC_connector_${part.id}`,
          pad,
          net: `/${nets.get(sourceNode(part.id, 'bus-in', pad))}`,
        }));

      if (!moduleIds.has(part.componentId)) return [];

      const reference = `BC_module_${part.id}`;

      return [
        ...powerPads.map((pad) => {
          const pin = pad.startsWith('GND') ? 'GND' : pad.split('_')[0];

          return {
            reference,
            pad,
            net: `/${nets.get(sourceNode(part.id, pin === 'VOUT' ? 'power-out' : 'power-in', pin))}`,
          };
        }),
        ...unusedPads.map((pad) => ({ reference, pad, net: `unconnected-(${reference}-Pad${pad})` })),
      ];
    })
    .sort((a, b) => a.reference.localeCompare(b.reference) || a.pad.localeCompare(b.pad));
}

async function drc(cli, dir, output) {
  cli(
    ['pcb', 'drc', 'robot.kicad_pcb', '--schematic-parity', '--format', 'json', '--severity-all', '--output', output],
    dir,
  );

  return JSON.parse(await fs.readFile(path.join(dir, output), 'utf8'));
}

export async function checkBoard({ fixture, dir, cli, exportOnly, root }) {
  const boardDir = path.join(dir, 'board');

  for (const [file, text] of Object.entries(fixture.board.files)) {
    const target = path.join(boardDir, file);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text);
  }

  const expected = expectedPads(fixture);

  assert.deepEqual(fixture.board.bytes, fixture.board.reopened);
  assert.ok(JSON.parse(fixture.board.files['requirements.json']).projection.requirements.length);

  if (exportOnly) return { pads: expected.length, validation: 'export-only' };

  await fs.copyFile(path.join(root, 'tools/electrical/pcb.py'), path.join(boardDir, 'pcb.py'));

  const facts = JSON.parse(cli(['pcb.py', 'robot.kicad_pcb', 'resave'], boardDir, 'python3'));
  const resaved = await fs.readFile(path.join(boardDir, 'robot.kicad_pcb'), 'utf8');

  assert.deepEqual(fixture.board.reconcile(resaved), {
    accepted: true,
    translationMm: [0, 0],
    segments: 0,
    vias: 0,
  });

  const actual = facts.pads.sort((a, b) => a.reference.localeCompare(b.reference) || a.pad.localeCompare(b.pad));

  assert.deepEqual(actual, expected);

  const modules = fixture.board.snapshot.parts.filter((part) => moduleIds.has(part.componentId));

  assert.equal(facts.holes.length, 4 + modules.length * 3);
  assert.equal(facts.holes.filter((diameter) => Math.abs(diameter - 2.18) < 0.00001).length, modules.length * 3);

  const checked = await drc(cli, boardDir, 'drc.json');

  assert.equal(checked.kicad_version, '9.0.6');
  assert.deepEqual(checked.violations, []);
  assert.equal(checked.schematic_parity?.length ?? 0, 0);

  if (expected.length) assert.ok(checked.unconnected_items.length > 0);

  if (fixture.name === 'dual-bus-arm') await negativeBoards({ fixture, cli, dir: boardDir, expected });

  const transforms = ['dual-bus-arm', 'battery-rover'].includes(fixture.name)
    ? await checkBoardTransforms({ fixture, cli, dir: boardDir, expectedCount: expected.length })
    : 0;

  return {
    pads: expected.length,
    unrouted: checked.unconnected_items.length,
    violations: checked.violations,
    validation: 'KiCad 9.0.6 PCB parser and DRC',
    transforms,
  };
}

async function negativeBoards({ fixture, cli, dir, expected }) {
  for (const mode of ['swap', 'overlap', 'outline']) {
    await fs.writeFile(path.join(dir, 'robot.kicad_pcb'), fixture.board.files['robot.kicad_pcb']);

    const facts = JSON.parse(cli(['pcb.py', 'robot.kicad_pcb', mode], dir, 'python3'));
    const checked = await drc(cli, dir, `${mode}.json`);

    if (mode === 'swap') {
      assert.notDeepEqual(facts.pads, expected);
      assert.ok((checked.schematic_parity?.length ?? 0) > 0);

      continue;
    }

    assert.ok(checked.violations.length > 0);
  }

  await fs.writeFile(path.join(dir, 'robot.kicad_pcb'), fixture.board.files['robot.kicad_pcb']);
}
