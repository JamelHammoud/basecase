import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { partSoup } from '../utils/sketch/fixtures/supportDesigns';
import { measureTriangles } from '../three/meshMeasure';
import { buildRig } from '../utils/kinematics';
import { buildMjcf } from '../sim/mjcf';
import { resolvePrinter } from '../data/printers';
import { checkPrintability } from '../three/printability';
import { reportFromShapes } from '../utils/printReport';
import { isPrinted } from '../utils/bom';
import { jobSpec } from '../print/job';
import { weld, writeThreeMf } from '../print/threeMf';
import { approximateScene } from '../guide/guideScene';
import { buildGuidePlan } from '../guide/guidePlan';
import { guideFingerprint } from '../guide/guideFingerprint';
import { withCurrentDrawings } from '../kit/drawings.fixtures';
import type { DesignParameter } from '../utils/designParameters/types';
import type { KitJob } from '../kit/types';

export async function fingerKitJob(parts: ScenePart[], parameters: DesignParameter[]) {
  const project = { ...DEFAULT_PROJECT, designParameters: parameters };
  const triangles = Object.fromEntries(parts.map((part) => [part.id, partSoup(part)]));
  const measures = Object.fromEntries(parts.map((part) => [part.id, measureTriangles(triangles[part.id])]));
  const printer = resolvePrinter(undefined, []);
  const print = reportFromShapes(
    parts
      .filter(isPrinted)
      .map((part) => ({ part, shape: { measure: measures[part.id], check: checkPrintability(triangles[part.id])! } })),
    { project, printer },
  );
  const spec = jobSpec(print.plan, printer, project);
  const files = Object.fromEntries(
    spec.files.map((file) => [
      file.key,
      writeThreeMf({
        objects: file.items.map((item, index) => ({ id: index + 1, name: item.name, mesh: weld(triangles[item.id]) })),
        items: file.items.map((item, index) => ({ objectId: index + 1, matrix: item.matrix, plate: item.plate })),
        plates: file.plates,
        plateSize: spec.plateSize,
        layout: 'grid',
      }),
    ]),
  );
  const model = buildMjcf({
    parts,
    rig: buildRig([], parts),
    project,
    measures,
    partTriangles: (id) => triangles[id] ?? null,
  });
  const job: KitJob = {
    name: 'Replacement fingers',
    parts,
    project,
    measures,
    purchases: {},
    guide: {
      plan: buildGuidePlan(approximateScene('Replacement fingers', parts, []), project.material),
      html: '<!doctype html><title>Replacement fingers</title>',
      fingerprint: guideFingerprint('Replacement fingers', parts, project),
    },
    spec,
    files,
    print,
    mapInput: { name: 'Replacement fingers', parts, project, model },
    checks: null,
    checksFingerprint: '',
  };

  return withCurrentDrawings(job);
}
