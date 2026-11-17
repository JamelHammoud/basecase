import { checkedKitElectrical } from './electrical';
import { kitDrawings, checkedKitDrawings } from './drawings';
import { registerSourced } from '../data/sourcedItems';
import { servoLayout } from '../robot/sceneRobot';
import { itemKeyOf } from '../guide/guideItems';
import { jointMap } from '../sim/robotPackage/jointMap';
import { jsonBytes } from '../sim/robotPackage/policyFiles';
import { buildBom } from '../utils/bom';
import { jsonHash } from '../utils/geometryHash';
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { kitCsv, packDemand, packingCsv } from './packing';
import type { KitJob, KitManifest } from './types';
import { validateKit } from './validateKit';

import { checkKitSource, KIT_MAX_BYTES } from './limits';
import { kitSheets } from './sheets';

function servoSheet(job: KitJob): KitManifest['servos'] {
  const map = jointMap(job.mapInput);
  const assigned = new Set<string>();

  const layout = servoLayout(job.project.joints ?? []);

  return map.joints.map((entry, index) => {
    const joint = layout.movable[index];
    const ids = joint?.actuators ?? [];
    const partId = ids[0];
    const part = job.parts.find((part) => part.id === partId);

    if (
      ids.length !== 1 ||
      !part?.componentId ||
      part.role !== 'solid' ||
      !entry.servo ||
      assigned.has(partId) ||
      entry.servo.componentId !== part.componentId ||
      (entry.servo.variant ?? '') !== (part.componentVariant ?? '')
    )
      throw new Error(`Kit export needs one exact actuator identity for ${entry.joint}.`);

    assigned.add(partId);

    return { partId, entry };
  });
}

export function kitManifest(job: KitJob): KitManifest {
  registerSourced(job.project.sourced ?? []);

  const supportG = Object.fromEntries(
    Object.entries(job.print.plates).map(([material]) => [
      material,
      job.print.parts
        .filter((part) => part.material === material)
        .reduce((sum, part) => sum + part.supportG * part.copies, 0),
    ]),
  );
  const bom = buildBom({
    ...job,
    supportG,
    wiring: job.wiring,
  });

  validateKit(job, bom);

  const printed = bom.printed.map((part) => ({
    ...part,
    key: itemKeyOf(job.parts.find((source) => source.id === part.id)!),
    outputs: job.spec.files.flatMap((file) =>
      file.items
        .filter((item) => item.id === part.id)
        .map((item, copy) => ({ file: `${file.key}.3mf`, plate: item.plate, copy })),
    ),
  }));
  const demand = [
    ...bom.lines.filter((line) => line.category !== 'Printed parts'),
    ...job.parts
      .filter((part) => part.id === job.project.electronicsBoard?.partId)
      .map((part) => ({ key: itemKeyOf(part), name: part.name, qty: 1, unit: 'pcs' as const, partIds: [part.id] })),
    ...printed.map((part) => ({
      key: part.key,
      name: part.name,
      qty: part.outputs.length,
      unit: 'pcs' as const,
      partIds: [part.id],
    })),
  ];

  return {
    format: 'basecase-manufacturing-kit',
    schema: 1,
    design: { name: job.name, fingerprint: jsonHash({ parts: job.parts, project: job.project }) },
    guide: job.guide.plan,
    guideEvidence: { fingerprint: job.guide.fingerprint, orderTimedOut: !!job.guide.orderTimedOut },
    purchases: bom.lines,
    packing: packDemand(demand, job.guide.plan, job.project.electronicsBoard),
    printed,
    electrical: job.electrical?.manifest,
    fabricated: job.project.electronicsBoard
      ? [{ partId: job.project.electronicsBoard.partId, process: 'PCB', qty: 1 }]
      : undefined,
    servos: servoSheet(job),
    wiring: job.wiring,
    drawings: job.drawings ? kitDrawings(job, job.drawings).manifest : undefined,
    sheets: kitSheets(job).map(({ dxf: _dxf, ...sheet }) => sheet),
    settings: {
      material: job.project.material,
      infillPct: job.project.infillPct,
      printProcess: job.project.printProcess,
    },
    printer: job.print.plan.printer,
    checks: { freshness: checkFreshness(job), result: job.checks },
    print: job.print.parts,
    labelNotes: job.labelNotes ?? {},
  };
}

function checkFreshness(job: KitJob): KitManifest['checks']['freshness'] {
  if (!job.checks) return 'not run';

  return job.checks.fingerprint && job.checks.fingerprint === job.checksFingerprint ? 'current' : 'stale';
}

export async function buildKit(job: KitJob): Promise<Uint8Array> {
  checkKitSource(job.parts);

  const sourceBytes =
    [
      ...Object.values(job.files),
      ...Object.values(job.electrical?.files ?? {}),
      ...Object.values(job.drawings?.files ?? {}),
    ].reduce((sum, bytes) => sum + bytes.byteLength, 0) +
    job.guide.html.length * 2;

  if (sourceBytes > KIT_MAX_BYTES) throw new Error('Kit export exceeds 256 MB.');

  const electrical = await checkedKitElectrical(job);
  const manifest = kitManifest(job);
  const drawings = await checkedKitDrawings(job);
  const text = new TextEncoder();
  const servos = kitCsv([
    ['part_id', 'joint', 'name', 'bus_id', 'family', 'component_id', 'variant'],
    ...manifest.servos.map(({ partId, entry }) => [
      partId,
      entry.joint,
      entry.name,
      entry.id,
      entry.family,
      entry.servo!.componentId,
      entry.servo!.variant,
    ]),
  ]);
  const files = {
    ...electrical,
    ...drawings.files,
    ...Object.fromEntries(Object.entries(job.files).map(([name, bytes]) => [`plates/${name}.3mf`, bytes])),
    ...Object.fromEntries(kitSheets(job).map((sheet) => [sheet.file, text.encode(sheet.dxf)])),
    'kit.json': jsonBytes(manifest),
    'provenance.json': jsonBytes({
      parts: job.parts,
      project: job.project,
      purchases: job.purchases,
      measures: job.measures,
      printPlan: job.print.plan,
      printSpec: job.spec,
      fingerprint: manifest.design.fingerprint,
    }),
    'packing.csv': text.encode(packingCsv(manifest.packing)),
    'servos.csv': text.encode(servos),
    'joint_map.json': jsonBytes(jointMap(job.mapInput)),
    'build-guide.html': text.encode(job.guide.html),
  };
  const total = Object.values(files).reduce((sum, bytes) => sum + bytes.byteLength, 0);

  if (total > KIT_MAX_BYTES) throw new Error('Kit export exceeds 256 MB.');

  return zipSync(files, { level: 6 });
}
