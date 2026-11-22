import type { Instance } from './analysisOps';
import { ownedShapeReport } from './ownedShapeReport';
import type { SceneShapes } from './sceneShapes';
import type { ShapeReport } from './shapeReports';
import type { Vec3 } from '../printability';

type Reports = Record<string, ShapeReport>;

type Faces = Record<string, Vec3[]> | undefined;

type Send = (instances: Instance[], faces: Faces) => Promise<Reports>;

const reportKey = (instance: Instance, faces: Faces) => JSON.stringify([instance.key, faces?.[instance.id] ?? []]);

export function printReportsCache(limit = 4000) {
  const entries = new Map<string, Promise<ShapeReport>>();

  return async (scene: SceneShapes, faces: Faces, send: Send): Promise<Reports> => {
    const missing = new Map<string, Instance>();
    const keys = scene.instances.map((instance) => {
      const key = reportKey(instance, faces);

      if (!entries.has(key)) missing.set(key, missing.get(key) ?? instance);

      return key;
    });

    if (missing.size) {
      const instances = [...missing.values()];
      const downs = Object.fromEntries(instances.filter(({ id }) => faces?.[id]).map(({ id }) => [id, faces![id]]));
      const preparing = send(instances, downs);

      for (const [key, instance] of missing) {
        const report = preparing
          .then((reports) => reports[instance.id])
          .catch((error: unknown) => {
            if (entries.get(key) === report) entries.delete(key);

            throw error;
          });

        entries.set(key, report);
      }
    }

    const waiting = keys.map((key) => entries.get(key)!);

    while (entries.size > limit) entries.delete(entries.keys().next().value!);

    const reports = await Promise.all(waiting);

    return Object.fromEntries(scene.instances.map(({ id }, index) => [id, ownedShapeReport(reports[index])]));
  };
}
