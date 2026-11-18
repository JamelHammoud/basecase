import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import assert from 'node:assert/strict';
import { inspectFabrication } from './routedFabrication.mjs';

export async function checkRoutedArtifacts(fixture, clean) {
  const request = fixture.prepared.request;

  assert.ok(request);
  assert.deepEqual(request.mechanicalIssues, []);

  assert.deepEqual(clean.issues, []);
  assert.deepEqual(JSON.parse(clean.report).violations, []);
  assert.deepEqual(JSON.parse(clean.report).unconnected_items, []);
  assert.deepEqual(JSON.parse(clean.report).schematic_parity, []);
  inspectFabrication(clean.files, request.pcb);

  const archive = await fixture.finish(clean);
  const repeated = await fixture.finish(clean);
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

  return {
    validation: 'KiCad 9.0.6 routed DRC, parity, Gerbers and drills',
    metrics: clean.metrics,
    fabricationFiles: Object.keys(clean.files).length,
  };
}
