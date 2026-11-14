import * as THREE from 'three';
import { resolvePrinter } from '../../data/printers';
import { buildGuidePlan } from '../../guide/guidePlan';
import { approximateScene } from '../../guide/guideScene';
import { printReportsIn, threeMfIn } from '../../three/analysis/analysisPool';
import { snapshotShapes } from '../../three/analysis/sceneShapes';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../../types/robotics';
import { printReportOf } from '../../utils/printReport';
import { jobSpec } from '../job';
import { fixtureMesh } from './label.fixtures';
import { partLetters } from './partLetters';

const printer = resolvePrinter('bambu-lab-p1s', []);

const meshOf = (p: ScenePart) => {
  if (p.cad) return fixtureMesh(p);

  const { width, height, depth } = p.dimensions;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));

  mesh.position.set(...p.position);
  mesh.updateMatrixWorld();

  return mesh;
};

const shapesOf = (parts: ScenePart[]) => snapshotShapes(parts.map((p) => ({ id: p.id, object: meshOf(p) })));

export const lettersOf = (parts: ScenePart[]) =>
  partLetters(buildGuidePlan(approximateScene('Bot', parts, []), 'PLA'), parts);

export async function platesOf(parts: ScenePart[], project: ProjectSettings = DEFAULT_PROJECT) {
  const report = await printReportOf(parts, { project, printer }, (ids, faces) =>
    printReportsIn(shapesOf(parts.filter((p) => ids.includes(p.id))), faces),
  );

  return { report, spec: jobSpec(report.plan, printer, project) };
}

export async function writePlates(parts: ScenePart[], labels?: Record<string, string>) {
  const { spec } = await platesOf(parts);

  return threeMfIn(shapesOf(parts), { files: spec.files, plateSize: spec.plateSize, labels });
}
