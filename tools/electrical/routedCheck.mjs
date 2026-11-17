import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import assert from 'node:assert/strict';
import { boardDigest } from '../../src/wiring/boardNativeContract.mjs';
import { runNativeBoard } from '../../electron/electrical/validate.mjs';
import { gerberFacts, drillFacts } from './fabricationFacts.mjs';

export async function checkRoutedFixture(fixture, cli) {
  const request = fixture.prepared.request;

  assert.ok(request);
  assert.deepEqual(request.mechanicalIssues, []);

  const execute = (args, cwd) => Promise.resolve(cli(args, cwd));
  const clean = await runNativeBoard(request, { cli: execute });

  assert.deepEqual(clean.issues, []);
  assert.deepEqual(JSON.parse(clean.report).violations, []);
  assert.deepEqual(JSON.parse(clean.report).unconnected_items, []);
  assert.deepEqual(JSON.parse(clean.report).schematic_parity, []);
  inspectFabrication(clean.files);

  const again = await runNativeBoard(request, { cli: execute });

  assert.deepEqual(again.files, clean.files);
  assert.equal(again.report, clean.report);

  const archive = await fixture.finish(clean);
  const repeated = await fixture.finish(again);
  const kit = unzipSync(await fixture.kit(clean));
  const kitManifest = JSON.parse(strFromU8(kit['kit.json']));
  const kitEvidence = JSON.parse(strFromU8(kit['electrical/manifest.json']));

  assert.equal(kitManifest.electrical.fabrication, 'included');
  assert.equal(kitManifest.electrical.designFingerprint, kitManifest.design.fingerprint);
  assert.equal(kitEvidence.sourceFingerprint, request.sourceFingerprint);
  assert.equal(kitEvidence.boardHash, request.boardHash);
  assert.equal(kitEvidence.geometryFingerprint, request.geometryFingerprint);
  assert.deepEqual(kitManifest.fabricated, [{ partId: 'board', process: 'PCB', qty: 1 }]);
  assert.ok(!kitManifest.printed.some((part) => part.id === 'board'));
  assert.equal(kitManifest.purchases.find((line) => line.key === 'component:jst-b3b-eh-a').toBuy, 1);
  assert.equal(
    kitManifest.packing.filter((row) => row.key === 'component:jst-b3b-eh-a').reduce((n, row) => n + row.qty, 0),
    2,
  );

  for (const [name, hash] of Object.entries(kitEvidence.hashes))
    assert.equal(createHash('sha256').update(kit[`electrical/${name}`]).digest('hex'), hash);

  for (const [name, text] of Object.entries(clean.files)) assert.equal(strFromU8(kit[`electrical/${name}`]), text);

  assert.deepEqual(archive.bytes, repeated.bytes);

  const files = unzipSync(archive.bytes);
  const manifest = JSON.parse(strFromU8(files['robot/manifest.json']));
  const project = JSON.parse(strFromU8(files['robot/robot.kicad_pro']));

  assert.equal(strFromU8(files['robot/robot.kicad_pcb']), request.pcb);
  assert.equal(project.board.design_settings.rules.min_track_width, request.rules.trackWidthMm);
  assert.equal(project.board.design_settings.rules.min_clearance, request.rules.clearanceMm);
  assert.equal(project.board.design_settings.rules.min_through_hole_diameter, request.rules.drillMm);

  for (const [name, hash] of Object.entries(manifest.hashes))
    assert.equal(createHash('sha256').update(files[`robot/${name}`]).digest('hex'), hash);

  for (const mode of ['short', 'missing', 'rules']) {
    const pcb = changedCopper(request.pcb, mode);
    const result = await runNativeBoard(
      { ...request, pcb, boardHash: await boardDigest(pcb), rules: mode === 'rules' ? null : request.rules },
      { cli: execute },
    );

    assert.ok(result.issues.includes(mode === 'missing' ? 'board-unrouted' : modeCode(mode)));
    assert.deepEqual(result.files, {});
  }

  for (const field of ['clearanceMm', 'trackWidthMm', 'drillMm']) {
    const result = await runNativeBoard({ ...request, rules: { ...request.rules, [field]: 1.1 } }, { cli: execute });

    assert.ok(result.issues.includes('board-drc'), `${field} must change real KiCad rules`);
    assert.deepEqual(result.files, {});
  }

  const viaPcb = routedViaBoard(request.pcb);
  const vias = await runNativeBoard(
    { ...request, pcb: viaPcb, boardHash: await boardDigest(viaPcb) },
    { cli: execute },
  );

  assert.deepEqual(vias.issues, []);
  assert.deepEqual(
    drillFacts(vias.files['fabrication/robot-PTH.drl'])
      .map((hole) => hole.diameter)
      .sort(),
    [...new Array(6).fill(0.4), ...new Array(6).fill(0.95)],
  );
  assert.equal(drillFacts(vias.files['fabrication/robot-NPTH.drl']).length, 4);

  return {
    validation: 'KiCad 9.0.6 routed DRC, parity, Gerbers and drills',
    metrics: clean.metrics,
    fabricationFiles: Object.keys(clean.files).length,
  };
}

const modeCode = (mode) => (mode === 'short' ? 'board-drc' : 'board-manufacturing');

function changedCopper(pcb, mode) {
  if (mode === 'missing') return pcb.replace(/\(segment \(start [^\n]+/u, '');

  if (mode === 'short')
    return pcb.replace(/\)\s*$/u, '(segment (start -10 0) (end -7.5 0) (width 0.25) (layer "B.Cu") (net 4)))');

  return pcb;
}

function inspectFabrication(files) {
  const top = gerberFacts(files['fabrication/robot-F_Cu.gbr']);
  const bottom = gerberFacts(files['fabrication/robot-B_Cu.gbr']);
  const outline = gerberFacts(files['fabrication/robot-Edge_Cuts.gbr']);

  assert.equal(top.function, 'Copper,L1,Top');
  assert.equal(bottom.function, 'Copper,L2,Bot');
  assert.deepEqual(top.nets, ['/DATA_1', '/GROUND_1', '/POSITIVE_1']);
  assert.deepEqual(bottom.nets, top.nets);
  assert.deepEqual(
    [...new Set(outline.points.map((point) => point[0]))].sort((a, b) => a - b),
    [-50, 50],
  );
  assert.deepEqual(
    [...new Set(outline.points.map((point) => point[1]))].sort((a, b) => a - b),
    [-40, 40],
  );
  assert.deepEqual(
    drillFacts(files['fabrication/robot-PTH.drl']).map((hole) => hole.diameter),
    new Array(6).fill(0.95),
  );
  assert.deepEqual(
    drillFacts(files['fabrication/robot-NPTH.drl']).map((hole) => hole.diameter),
    new Array(4).fill(3.2),
  );

  const positions = (name) =>
    drillFacts(files[`fabrication/${name}`])
      .map(({ x, y }) => [x, y])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  assert.deepEqual(positions('robot-NPTH.drl'), [
    [-44, -34],
    [-44, 34],
    [44, -34],
    [44, 34],
  ]);
  assert.deepEqual(positions('robot-PTH.drl'), [
    [-10, -12],
    [-10, 12],
    [-7.5, -12],
    [-7.5, 12],
    [-5, -12],
    [-5, 12],
  ]);
  assert.equal(gerberFacts(files['fabrication/robot-f_silkscreen.gbr']).function, 'Legend,Top');
  assert.equal(gerberFacts(files['fabrication/robot-b_silkscreen.gbr']).function, 'Legend,Bot');
  assert.equal(gerberFacts(files['fabrication/robot-F_Mask.gbr']).function, 'Soldermask,Top');
  assert.equal(gerberFacts(files['fabrication/robot-B_Mask.gbr']).function, 'Soldermask,Bot');
}

function routedViaBoard(pcb) {
  return pcb.replace(
    /\(segment \(start ([^ ]+) (-?[\d.]+)\) \(end ([^ ]+) (-?[\d.]+)\) \(width 0.25\) \(layer "B.Cu"\) \(net (\d+)\)\)/gu,
    (...match) => {
      const [, x, from, endX, to, net] = match;

      assert.equal(x, endX);

      const segment = (start, end, layer) =>
        `(segment (start ${x} ${start}) (end ${x} ${end}) (width 0.25) (layer "${layer}") (net ${net}))`;
      const via = (y) => `(via (at ${x} ${y}) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net ${net}))`;

      return [segment(from, -4, 'B.Cu'), via(-4), segment(-4, 4, 'F.Cu'), via(4), segment(4, to, 'B.Cu')].join('\n');
    },
  );
}
