import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { toleranceFixture } from './tolerances.fixtures';
import { decodeSceneFile, encodeSceneFile } from '../sceneFile';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildDrawings } from '../../sheet/drawings';
import { buildKit } from '../../kit/buildKit';
import { kitFixture } from '../../kit/kit.fixtures';
import { jsonHash } from '../geometryHash';
import { docFromParts, pushHistory, trackedOf, travelProject } from '../../workspace/docHistory';
import { analyzeTolerances } from './tolerances';
import { permittedParameterEdit } from '../../workspace/parameterEditGuard';
import { refuseParameterTransfer } from './transfers';
import { copyToClipboard, takePaste } from '../../workspace/partsClipboard';

it('reopens an actual scene file with declarations, requirements and exact history states', async () => {
  const design = toleranceFixture();
  const project = {
    ...DEFAULT_PROJECT,
    designParameters: design.parameters,
    dimensionalRequirements: design.requirements,
  };
  const after = {
    ...project,
    designParameters: project.designParameters.map((parameter) => ({
      ...parameter,
      tolerance: { lower: 0, upper: 0 },
    })),
  };
  const doc = pushHistory(docFromParts(design.parts), design.parts, trackedOf(project));
  const undone = travelProject(doc, after, { direction: 'undo' })!;
  const redone = travelProject(undone.doc, undone.project, { direction: 'redo' })!;

  expect(undone.project).toEqual(project);
  expect(redone.project).toEqual(after);

  const folder = await mkdtemp(join(tmpdir(), 'tolerance-scene-'));

  try {
    const file = join(folder, 'spacers.basecase');
    const blob = await encodeSceneFile({
      name: 'Spacers',
      globalGoal: '',
      annotations: [],
      parts: design.parts,
      project,
    });

    await writeFile(file, blob);

    const reopened = await decodeSceneFile(new Uint8Array(await readFile(file)));

    expect(reopened.project!.designParameters).toEqual(design.parameters);
    expect(reopened.project!.dimensionalRequirements).toEqual(design.requirements);
    expect(
      analyzeTolerances({
        parts: reopened.parts,
        parameters: reopened.project!.designParameters!,
        requirements: reopened.project!.dimensionalRequirements,
      }),
    ).toEqual(analyzeTolerances(design));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

it('preserves in-scene duplication and refuses deleting contributors or transferring bound parts', () => {
  const design = toleranceFixture();
  const project = {
    ...DEFAULT_PROJECT,
    designParameters: design.parameters,
    dimensionalRequirements: design.requirements,
  };

  expect(permittedParameterEdit(design.parts.slice(1), project)).toBe(false);
  expect(() => refuseParameterTransfer(design.parts)).toThrow();
  copyToClipboard(design.parts, 'tolerances', false, design.parameters);

  const copies = takePaste('tolerances', design.parameters)!;

  expect(copies.map((part) => part.dimensionBindings)).toEqual(design.parts.map((part) => part.dimensionBindings));
  expect(() => takePaste('other', design.parameters)).toThrow();
  expect(
    permittedParameterEdit([...design.parts, ...copies.map((part) => ({ ...part, id: `copy-${part.id}` }))], project),
  ).toBe(true);
});

it('reconciles real standalone Drawings and Kit evidence against the frozen source and rejects corruption', async () => {
  const design = toleranceFixture();
  const job = kitFixture();

  const bound = job.parts.filter((part) => part.kind === 'box' && !part.componentId).slice(0, 2);

  expect(bound).toHaveLength(2);
  design.parts = bound.map((part, index) => ({ ...part, dimensionBindings: design.parts[index].dimensionBindings }));
  design.parameters = design.parameters.map((parameter, index) => ({
    name: parameter.name,
    unit: parameter.unit,
    tolerance: parameter.tolerance,
    value: bound[index].dimensions.width,
  }));
  design.requirements[0].dimensions = design.requirements[0].dimensions.map((dimension, index) => ({
    ...dimension,
    part: bound[index].id,
  }));
  job.parts = job.parts.map((part) => design.parts.find((item) => item.id === part.id) ?? part);
  job.project = { ...job.project, designParameters: design.parameters, dimensionalRequirements: design.requirements };
  job.designFingerprint = jsonHash({ parts: job.parts, project: job.project });

  const standalone = await buildDrawings({
    parts: job.parts,
    sourceSnapshot: { parts: job.parts, project: job.project },
    source: { name: job.name, id: 'spacers', fingerprint: job.designFingerprint },
    options: { frame: 'part', plane: 'xy', scale: 0.2 },
  });

  job.drawings = { manifest: standalone.manifest, files: unzipSync(standalone.bytes) };

  const files = unzipSync(await buildKit(job));
  const manifest = JSON.parse(strFromU8(files['kit.json']));
  const standaloneManifest = JSON.parse(strFromU8(files['drawings/drawings.json']));

  expect(manifest.drawings).toEqual(standaloneManifest);
  expect(standaloneManifest.source.fingerprint).toBe(job.designFingerprint);
  expect(standaloneManifest.tolerances).toEqual({
    parameters: design.parameters,
    requirements: design.requirements,
    results: analyzeTolerances(design),
  });
  expect(
    standaloneManifest.sheets.find((sheet: { partIds: string[] }) => sheet.partIds.includes(bound[0].id))
      .authoredDimensions,
  ).toHaveLength(1);
  expect(standaloneManifest.numericalToleranceMm).toBeCloseTo(0.002, 8);
  job.drawings.manifest.tolerances!.results[0].nominal = 999;
  await expect(buildKit(job)).rejects.toThrow(/tolerances/);
});
