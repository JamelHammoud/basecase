import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { exportCutFiles } from '../sheet/cutFiles';
import { sheetOf } from '../sheet/materials';
import type { KitJob } from './types';

export function kitSheets(job: KitJob) {
  return job.parts.flatMap((part, index) => {
    const setting = sheetOf(part, job.measures[part.id]?.sheet);

    if (part.id === job.project.electronicsBoard?.partId || part.role !== 'solid' || !setting) return [];

    const profile = job.measures[part.id]?.sheet;

    if (!profile) throw new Error(`${part.name}: use a flat part with through holes for Cut Files.`);

    const files = unzipSync(exportCutFiles([{ part, profile }]));
    const [name, bytes] = Object.entries(files)[0];

    return [{ partId: part.id, ...setting, file: `sheets/${index + 1}/${name}`, dxf: strFromU8(bytes) }];
  });
}
