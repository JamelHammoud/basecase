#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs, MIME, startStudio } from './studioRun.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const { port, ids } = cliArgs();

if (ids.length === 0) {
  console.error('Usage: node tools/parts/generate.mjs <id…> [--port 5381]');
  process.exit(1);
}

const started = Date.now();
const log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);

const POSE = {
  servo:
    'Case bottom on the floor (z = 0), output shaft pointing up (+Z), long side along X, output shaft on the +X half.',
  motor: 'Mounting face up: body on the floor (z = 0), output shaft pointing up (+Z).',
  board: 'PCB flat on the floor (bottom face at z = 0), component side up, long side along X.',
  camera:
    'Upright as it is normally mounted: base on the floor (z = 0), lenses facing the front (−Y), long side along X.',
  gripper:
    'Mounting flange on the floor (z = 0), fingers pointing up (+Z), jaws closing along X, at the open position.',
  hand: 'Wrist mount on the floor (z = 0), fingers pointing up (+Z), palm facing the front (−Y), fingers straight (open hand).',
  lidar: 'Mounting face on the floor (z = 0), scan plane horizontal, cable or connector toward the back (+Y).',
  battery:
    'Lying flat on its largest face (bottom at z = 0), long side along X, the end the leads leave from toward +X.',
  cell: 'Lying on its side on the floor (z = 0), axis along X, positive terminal toward +X.',
};

const studio = await startStudio({ port, log });

for (const id of ids) {
  const specDir = path.join(here, 'specs', id);
  const recordFile = path.join(specDir, 'record.json');

  if (!fs.existsSync(recordFile)) {
    log(`${id}: no ${path.relative(root, recordFile)}`);

    continue;
  }

  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  const out = path.join(here, 'generated', id);

  fs.mkdirSync(out, { recursive: true });

  const t0 = Date.now();

  await studio.newConversation();

  const folderId = `part-${id}-${Date.now().toString(36)}`;
  const save = (relPath, payload) =>
    studio.saveEvidence({
      folderId,
      folderName: `${record.name} specs`,
      relPath,
      ...payload,
    });

  await save('record.json', { text: JSON.stringify(record, null, 1) });

  const images = fs.readdirSync(specDir).filter((f) => MIME[path.extname(f).toLowerCase()]);

  for (const f of images) {
    await save(f, {
      dataUrl: `data:${MIME[path.extname(f).toLowerCase()]};base64,${fs.readFileSync(path.join(specDir, f)).toString('base64')}`,
    });
  }

  const pose = POSE[record.pose] ?? POSE.board;
  const promptText = [
    `Model the ${record.name} (${record.manufacturer} ${record.mpn}) as an exact replica for a parts library. People will design mounts, pockets and brackets around it, so every dimension must match the manufacturer's numbers.`,
    '',
    `- Use only the official numbers in record.json and the attached drawings (${images.length} images). Read all of them first. Don't take sizes from sellers or community models.`,
    '- Model what fits and mates: overall envelope, mounting holes and tabs at their exact positions and diameters, output shaft or spline (outer diameter and height), horn interface, connectors and lenses at their stated positions.',
    '- Where the official sources give no number for a feature, keep that feature plain and conservative, and list it under "Not dimensioned" in your final message. Never invent precise-looking detail.',
    `- Pose: ${pose}`,
    "- One part per separate physical body (case, horn, PCB, header, connector), each with model_part, in realistic colors (e.g. case #1d1d1f, PCB #1f5f3a or the board's real color, metal #c8c8cc).",
    '- No cables, leads or plugs (they bend, and their exit points are rarely dimensioned). No guides, cutouts or labels. Finish with check_scene and look, and compare the bounding box with the record envelope.',
    '',
    'Final message: a short table of the key dimensions you modeled and their sources, then "Not dimensioned".',
  ].join('\n');

  log(`${id}: prompting with ${images.length} images`);

  const result = await studio.prompt(promptText, [{ id: folderId }]);

  log(`${id}: agent finished (${result.stopReason ?? result.error}) in ${Math.round((Date.now() - t0) / 1000)}s`);

  studio.reply.text = '';

  const review = await studio.prompt(
    [
      'Verify the model against the official numbers before we save it.',
      '',
      "1. get_scene, then make a table with one row per dimension and feature in record.json (envelope, each protrusion such as a spline, boss, shaft or pilot, tab heights and hole positions, connector positions): official value · value measured on your model (from part positions and sizes: e.g. a spline's top must sit exactly its protrusion above the face it stands on) · OK or wrong.",
      '2. Check every part sits where it belongs: protrusions start at the face they come out of, nothing that should be outside is buried inside another part, nothing floats.',
      '3. Fix every wrong row (update_parts or model_part), then look and check_scene again.',
      '',
      'Final message: the table after fixes, then "Not dimensioned".',
    ].join('\n'),
  );

  log(`${id}: verified (${review.stopReason ?? review.error}) in ${Math.round((Date.now() - t0) / 1000)}s total`);

  const stat = await studio.exportGlb(id, { source: 'agent', triangleBudget: 80000 });

  if (!stat) {
    log(`${id}: the agent produced no solid parts`);

    continue;
  }

  log(`${id}: ${stat.size.join(' × ')} mm · ${stat.triangles} tris · ${stat.colors} colors`);
  await studio.saveRecord(out, ['iso', 'front', 'side', 'top']);

  const finalText = studio.reply.text.trim();

  fs.writeFileSync(
    path.join(out, 'notes.md'),
    `# ${record.name}\n\nModeled by the studio agent on ${new Date().toISOString().slice(0, 10)} from the official drawings in tools/parts/specs/${id}/.\n\nEnvelope: ${stat.size.join(' × ')} mm (studio frame, Y up).\n\n${finalText}\n`,
  );
}

await studio.close();
process.exit(0);
