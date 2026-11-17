import { prepareDrawingFiles } from '../sheet/drawings';
import { jsonHash } from '../utils/geometryHash';
import type { KitJob } from './types';
import { kitFixture } from './kit.fixtures';

export async function withCurrentDrawings(job: KitJob) {
  const fingerprint = jsonHash({ parts: job.parts, project: job.project });
  const drawings = await prepareDrawingFiles({
    parts: job.parts,
    source: { id: 'kit-fixture', name: job.name, fingerprint },
    options: { frame: 'part', plane: 'xy', scale: 0.2 },
  });

  return { ...job, drawings, designFingerprint: fingerprint };
}

export function drawnKitFixture(name?: string) {
  return withCurrentDrawings(kitFixture(name));
}
