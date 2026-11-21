import type { ElectricalInput } from '../wiring/electricalTypes';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { reportFromShapes } from '../utils/printReport';
import { isPrinted } from '../utils/bom';
import { checkPrintability } from '../three/printability';
import { jobSpec } from '../print/job';
import { weld, writeThreeMf } from '../print/threeMf';
import { fixtureMeasures } from '../sim/fixtures/parts';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { approximateScene } from '../guide/guideScene';
import { buildGuidePlan } from '../guide/guidePlan';
import { guideFingerprint } from '../guide/guideFingerprint';
import { wiringNetlist } from '../wiring/netlist';
import { withCurrentDrawings } from './drawings.fixtures';
import { kitFixture } from './kit.fixtures';

export async function electricalKitJob(name: string, input: ElectricalInput) {
  const base = kitFixture();
  const { parts, project } = input;
  const map = fixturePackageJob({ id: name, parts, joints: project.joints ?? [] }).job;
  const plan = buildGuidePlan(
    { ...approximateScene(name, parts, project.joints ?? []), boardPartId: project.electronicsBoard?.partId },
    project.material,
  );

  const measures = fixtureMeasures(parts);
  const triangles = fixtureTriangles(parts);
  const report = reportFromShapes(
    parts
      .filter((part) => part.id !== project.electronicsBoard?.partId && isPrinted(part))
      .map((part) => ({
        part,
        shape: { measure: measures[part.id], check: checkPrintability(triangles(part.id)!)! },
      })),
    { project, printer: base.print.printer },
  );
  const spec = jobSpec(report.plan, base.print.printer, project);
  const files = Object.fromEntries(
    spec.files.map((file) => [
      file.key,
      writeThreeMf({
        objects: file.items.map((item, i) => ({ id: i + 1, name: item.name, mesh: weld(triangles(item.id)!) })),
        items: file.items.map((item, i) => ({ objectId: i + 1, matrix: item.matrix, plate: item.plate })),
        plates: file.plates,
        plateSize: spec.plateSize,
        layout: 'grid',
      }),
    ]),
  );

  return withCurrentDrawings({
    ...base,
    name,
    parts,
    project,
    measures,
    mapInput: { ...base.mapInput, parts, project, model: map.model },
    guide: {
      plan,
      fingerprint: guideFingerprint(name, parts, project),
      html: '<!doctype html><title>Board kit</title>',
    },
    wiring: wiringNetlist(input),
    spec,
    files,
    print: report,
  });
}
