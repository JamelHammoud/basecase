import { frozenViewParts } from './frozenView';

export { frozenViewParts } from './frozenView';

import { checkedKitElectrical } from './electrical';
import { checkedKitDrawings } from './drawings';
import type { MeshData } from '../print/threeMf';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { frozenKitContent, hydrateFrozenKit, type PreparedFrozenKit } from './frozenContent';

export { frozenKitContent, type PreparedFrozenKit } from './frozenContent';

import { kitManifest } from './buildKit';
import { kitSheets } from './sheets';
import { checkKitSource } from './limits';
import type { KitJob, KitManifest } from './types';
import { copySourceKeys } from '../print/copySource';
import { shapeKey } from '../print/shapeKey';
import { purchaseSnapshot } from '../utils/purchaseSnapshot';

export interface FrozenKit {
  format: 'basecase-frozen-build';
  schema: 1;
  manifest: KitManifest;
  parts: ScenePart[];
  project: ProjectSettings;
  geometry: Record<string, { positions: number[]; indices: number[] }>;
  outputs: Record<string, number[]>;
  productionKeys?: Record<string, string>;
  legacyKeys?: Record<string, string>;
  provenance: Pick<KitJob, 'purchases' | 'measures' | 'spec'> & { printPlan: KitJob['print']['plan'] };
}

export async function freezeBuildKit({ job, meshes = {} }: { job: KitJob; meshes?: Record<string, MeshData> }) {
  checkKitSource(job.parts);

  const electrical = await checkedKitElectrical(job);
  const drawings = job.drawings ? (await checkedKitDrawings(job)).files : {};
  const manifest = kitManifest(job);
  const printedIds = new Set(manifest.printed.map((part) => part.id));
  const geometry = Object.fromEntries(
    Object.entries(meshes).map(([id, mesh]) => [
      id,
      { positions: Array.from(mesh.vertices), indices: Array.from(mesh.indices) },
    ]),
  );

  return frozenKitContent({
    format: 'basecase-frozen-build',
    schema: 1,
    manifest,
    parts: job.parts,
    project: job.project,
    geometry,
    productionKeys: copySourceKeys(
      job.parts.filter((part) => printedIds.has(part.id)),
      geometry,
    ),
    outputs: Object.fromEntries(
      Object.entries({
        ...Object.fromEntries(Object.entries(job.files).map(([key, bytes]) => [`plates/${key}.3mf`, bytes])),
        ...Object.fromEntries(kitSheets(job).map((sheet) => [sheet.file, new TextEncoder().encode(sheet.dxf)])),
        ...electrical,
        ...drawings,
      }).map(([key, bytes]) => [key, Array.from(bytes)]),
    ),
    provenance: {
      purchases: purchaseSnapshot(job.purchases),
      measures: job.measures,
      spec: job.spec,
      printPlan: job.print.plan,
    },
  });
}

export function readFrozenKit(content: PreparedFrozenKit): FrozenKit {
  const kit = hydrateFrozenKit(content);

  checkFrozenEnvelope(kit);

  checkKitSource(kit.parts);
  checkFrozenReferences(kit);

  frozenViewParts(kit);

  checkFrozenOutputs(kit);

  const printedIds = new Set(kit.manifest.printed.map((part) => part.id));
  const printed = kit.parts.filter((part) => printedIds.has(part.id));

  return {
    ...kit,
    productionKeys: copySourceKeys(printed, kit.geometry),
    legacyKeys: Object.fromEntries(printed.map((part) => [part.id, shapeKey(part)])),
  };
}

function checkFrozenOutputs(kit: FrozenKit) {
  const files = [
    ...kit.manifest.printed.flatMap((part) => part.outputs.map((output) => `plates/${output.file}`)),
    ...kit.manifest.sheets.map((sheet) => sheet.file),
    ...(kit.manifest.electrical ? [kit.manifest.electrical.manifest] : []),
    ...(kit.manifest.drawings?.sheets.flatMap((sheet) => [`drawings/${sheet.svg}`, `drawings/${sheet.geometryFile}`]) ??
      []),
  ];

  if (kit.manifest.printed.some((part) => !part.outputs.length) || files.some((file) => !kit.outputs[file]?.length))
    throw new Error('The build kit is damaged.');
}

function checkFrozenEnvelope(kit: FrozenKit) {
  if (
    kit.format !== 'basecase-frozen-build' ||
    kit.schema !== 1 ||
    kit.manifest?.format !== 'basecase-manufacturing-kit' ||
    kit.manifest.schema !== 1 ||
    !kit.parts?.length ||
    !kit.manifest.guide?.steps.length ||
    !kit.project ||
    !kit.geometry
  )
    throw new Error('The build kit is damaged.');
}

function checkFrozenReferences(kit: FrozenKit) {
  const ids = new Set(kit.parts.filter((part) => part.role === 'solid').map((part) => part.id));
  const plan = kit.manifest.guide;
  const covered = new Set(plan.steps.flatMap((step) => step.partIds));

  if (
    ids.size !== plan.partIds.length ||
    plan.steps.length > 10000 ||
    plan.partIds.some((id) => !ids.has(id) || !covered.has(id)) ||
    [...covered].some((id) => !ids.has(id))
  )
    throw new Error('The build kit is damaged.');

  for (const id of ids) checkGeometry(kit.geometry[id]);
}

function checkGeometry(geometry: FrozenKit['geometry'][string] | undefined) {
  if (
    !geometry ||
    !Array.isArray(geometry.positions) ||
    !Array.isArray(geometry.indices) ||
    geometry.positions.length < 9 ||
    geometry.positions.length % 3 ||
    geometry.indices.length < 3 ||
    geometry.indices.length % 3 ||
    !geometry.positions.every(Number.isFinite)
  )
    throw new Error('The build geometry is missing.');

  const count = geometry.positions.length / 3;

  if (geometry.indices.some((index) => !Number.isInteger(index) || index < 0 || index >= count))
    throw new Error('The build geometry is missing.');
}
