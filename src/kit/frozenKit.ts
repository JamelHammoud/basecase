import { frozenViewParts } from './frozenView';

export { frozenViewParts } from './frozenView';

import { checkedKitElectrical } from './electrical';
import { checkedKitDrawings } from './drawings';
import type { MeshData } from '../print/threeMf';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { frozenKitContent, hydrateFrozenKit, type PreparedFrozenKit } from './frozenContent';

export { frozenKitContent, type PreparedFrozenKit } from './frozenContent';

import { kitManifest } from './buildKit';
import { checkKitSource } from './limits';
import type { KitJob, KitManifest } from './types';

export interface FrozenKit {
  format: 'basecase-frozen-build';
  schema: 1;
  manifest: KitManifest;
  parts: ScenePart[];
  project: ProjectSettings;
  geometry: Record<string, { positions: number[]; indices: number[] }>;
  outputs: Record<string, number[]>;
  provenance: Pick<KitJob, 'purchases' | 'measures' | 'spec'> & { printPlan: KitJob['print']['plan'] };
}

export async function freezeBuildKit({ job, meshes = {} }: { job: KitJob; meshes?: Record<string, MeshData> }) {
  checkKitSource(job.parts);

  const electrical = await checkedKitElectrical(job);
  const drawings = job.drawings ? (await checkedKitDrawings(job)).files : {};
  const manifest = kitManifest(job);
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
    outputs: Object.fromEntries(
      Object.entries({
        ...Object.fromEntries(Object.entries(job.files).map(([key, bytes]) => [`plates/${key}.3mf`, bytes])),
        ...electrical,
        ...drawings,
      }).map(([key, bytes]) => [key, Array.from(bytes)]),
    ),
    provenance: { purchases: job.purchases, measures: job.measures, spec: job.spec, printPlan: job.print.plan },
  });
}

export function readFrozenKit(content: PreparedFrozenKit): FrozenKit {
  const kit = hydrateFrozenKit(content);

  checkFrozenEnvelope(kit);

  checkKitSource(kit.parts);
  checkFrozenReferences(kit);

  frozenViewParts(kit);

  for (const part of kit.manifest.printed) {
    if (part.outputs.some((output) => !kit.outputs?.[`plates/${output.file}`]?.length))
      throw new Error('The build kit is damaged.');
  }

  return kit;
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
