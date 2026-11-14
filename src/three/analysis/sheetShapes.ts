import { cutFilesZip, type CutFilesResult, type CutFilesTask } from '../../sheet/cutFiles';
import { detectSheet, type SheetProfile } from '../../sheet/detectSheet';
import type { Instance } from './analysisOps';
import type { ShapeSolid } from './shapeSolid';

const profiles = new WeakMap<ShapeSolid, SheetProfile | null>();

export function sheetProfile(solid: ShapeSolid): SheetProfile | null {
  if (!profiles.has(solid)) profiles.set(solid, detectSheet(solid.positions));

  return profiles.get(solid) ?? null;
}

export function sceneCutFiles(
  task: CutFilesTask & { instances: Instance[] },
  solidOf: (key: string) => ShapeSolid,
): CutFilesResult {
  const keys = new Map(task.instances.map((i) => [i.id, i.key]));

  return cutFilesZip(task, (id) => {
    const key = keys.get(id);

    return key ? sheetProfile(solidOf(key)) : null;
  });
}
