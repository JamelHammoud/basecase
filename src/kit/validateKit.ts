import { COMPONENT_BY_ID, componentVariant } from '../data/components';
import { guideFingerprint } from '../guide/guideFingerprint';
import { itemKeyOf } from '../guide/guideItems';
import { isBuilt } from '../guide/guidePlan';
import { sheetOf } from '../sheet/materials';
import { boughtKey, describeKey, isPrinted, type Bom } from '../utils/bom';
import type { ScenePart } from '../types/robotics';
import type { KitJob } from './types';

function validatePart(part: ScenePart, job: KitJob) {
  const measure = job.measures[part.id];

  if (!isBuilt(part) || !measure || !Number.isFinite(measure.volumeMm3) || measure.volumeMm3 <= 0)
    throw new Error(`Kit export needs solid geometry for ${part.name}.`);

  if (sheetOf(part)) throw new Error(`Kit export can’t include ${part.name}. Export sheet parts through Cut Files.`);

  if (part.componentId) validateCatalog(part);

  if (!boughtKey(part) && !isPrinted(part))
    throw new Error(`Kit export needs a manufacturing process for ${part.name}.`);
}

function validateCatalog(part: Pick<ScenePart, 'componentId' | 'componentVariant' | 'name'>) {
  const component = COMPONENT_BY_ID[part.componentId!];
  const variant = component && componentVariant(component, part.componentVariant);

  if (!component || (component.variants?.length && !variant) || (part.componentVariant && !variant))
    throw new Error(`Choose an exact catalog version for ${part.name}.`);
}

export function validateKit(job: KitJob, bom: Bom) {
  const solids = job.parts.filter((part) => part.role === 'solid');

  validateGuide(job, solids);

  if (job.guide.fingerprint !== guideFingerprint(job.name, job.parts, job.project) || !job.guide.html)
    throw new Error('Update the build guide before exporting the kit.');

  for (const part of solids) validatePart(part, job);

  for (const line of bom.lines.filter((line) => line.key.startsWith('component:'))) {
    const [componentId, componentVariant] = line.key.slice('component:'.length).split('|');

    validateCatalog({ componentId, componentVariant, name: line.name });
  }

  if (bom.standIns.length || bom.unmeasured.length || bom.madeElsewhere.length)
    throw new Error('Replace stand-ins and unsupported fabrication before exporting the kit.');

  validateOutputs(job, bom);
}

function validateGuide(job: KitJob, solids: ScenePart[]) {
  const ids = new Set(solids.map((part) => part.id));
  const planned = new Set(job.guide.plan.partIds);
  const steps = new Set(job.guide.plan.steps.flatMap((step) => step.partIds));
  const items = new Map(job.guide.plan.items.flatMap((item) => item.partIds.map((id) => [id, item.key])));
  const complete = solids.every(
    (part) => planned.has(part.id) && steps.has(part.id) && items.get(part.id) === itemKeyOf(part),
  );

  if (!solids.length || ids.size !== solids.length || planned.size !== ids.size || !complete || job.guide.plan.repair)
    throw new Error('Kit export needs a complete build guide.');

  if (job.project.extras?.some((extra) => extra.qty > 0 && !describeKey(extra.key)))
    throw new Error('Kit export needs exact identities for every BOM line.');
}

function validateOutputs(job: KitJob, bom: Bom) {
  const files = job.spec.files.map((file) => file.key);

  if (
    new Set(files.map((key) => key.toLowerCase())).size !== files.length ||
    files.some((key) => !/^[a-z0-9_-]+$/i.test(key))
  )
    throw new Error('Kit plate filenames must be unique.');

  if (files.some((key) => !job.files[key]?.length) || Object.keys(job.files).some((key) => !files.includes(key)))
    throw new Error('Kit export needs every plate file.');

  const printed = new Set(bom.printed.map((part) => part.id));
  const outputs = job.spec.files.flatMap((file) => file.items);

  if (outputs.some((item) => !printed.has(item.id)) || job.print.parts.some((part) => !part.check.fits))
    throw new Error('Arrange every printed part on a supported plate before exporting the kit.');

  for (const part of bom.printed) {
    const count = outputs.filter((item) => item.id === part.id).length;
    const source = job.parts.find((item) => item.id === part.id)!;

    if (count !== Math.max(1, source.print?.copies ?? 1))
      throw new Error(`Kit export needs printable output for ${part.name}.`);
  }
}
