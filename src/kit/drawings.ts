import { jsonHash } from '../utils/geometryHash';
import { bytesFingerprint } from '../sheet/drawingStl';
import { drawingQuantity } from '../sheet/drawingQuantity';
import type { PreparedDrawings } from '../sheet/drawingsClient';
import type { KitJob } from './types';
import { boughtKey } from '../utils/bom';

export function kitDrawings(job: KitJob, prepared: PreparedDrawings) {
  const { manifest, files } = prepared;
  const bound = new Set<string>();

  if (
    manifest.source.name !== job.name ||
    manifest.source.fingerprint !== job.designFingerprint ||
    manifest.source.fingerprint !== jsonHash({ parts: job.parts, project: job.project })
  )
    throw new Error('Prepare drawings from the current kit geometry.');

  for (const sheet of manifest.sheets) {
    const sources = sheet.partIds.map((id) => job.parts.find((part) => part.id === id));
    const quantity = sources.reduce((sum, part) => sum + (part ? drawingQuantity(part) : 0), 0);

    if (
      !sources.length ||
      sources.some((part) => !part || part.role !== 'solid' || boughtKey(part) || bound.has(part.id)) ||
      sheet.quantity !== quantity ||
      !files[sheet.svg] ||
      !files[sheet.geometryFile] ||
      !/^[a-f0-9]{64}$/.test(sheet.geometryFileFingerprint) ||
      !/^[a-f0-9]{64}$/.test(sheet.geometryFingerprint)
    )
      throw new Error('Reconcile drawing geometry and quantities before exporting the kit.');

    sheet.partIds.forEach((id) => bound.add(id));
  }

  if (job.parts.some((part) => part.role === 'solid' && !boughtKey(part) && !bound.has(part.id)))
    throw new Error('Include every fabricated part in the kit drawings.');

  return {
    manifest,
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [`drawings/${name}`, bytes])),
  };
}

export async function checkedKitDrawings(job: KitJob) {
  if (!job.drawings) throw new Error('Include every fabricated part in the kit drawings.');

  const result = kitDrawings(job, job.drawings);

  for (const sheet of result.manifest.sheets) {
    const bytes = job.drawings.files[sheet.geometryFile];
    const header = new TextDecoder().decode(bytes.subarray(0, 71));

    if (
      (await bytesFingerprint(bytes)) !== sheet.geometryFileFingerprint ||
      header !== `SHA256:${sheet.geometryFingerprint}`
    )
      throw new Error('Reconcile drawing geometry and quantities before exporting the kit.');
  }

  return result;
}
