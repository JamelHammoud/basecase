import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { generatedFit, fitServices } from './fitVariants.fixtures';
import { fitSourceHash, type FitPlateIdentity } from './fitVariantIdentity';
import { fitVariantCoupons } from './fitVariantGeometry';
import { fitBindings, fitVariantEdit, prepareFitVariants } from './fitVariants';
import { writeFitPlate } from './fitPlateWriter';
import { couponPart, fitTestReport } from './fitTest';
import { jobSpec } from './job';
import { resolvePrinter } from '../data/printers';
import { DEFAULT_PROJECT } from '../types/robotics';
import { useSceneDocument, type SceneDocument } from '../workspace/useSceneDocument';
import { useDesignParameters, type DesignParameters } from '../workspace/useDesignParameters';
import { decodeSceneFile, encodeSceneFile } from '../utils/sceneFile';
import { readinessFingerprint } from '../readiness/readiness';
import { printReportOf } from '../utils/printReport';
import { partSoup } from '../utils/sketch/fixtures/supportDesigns';
import { sliceLookup } from './slices';
import { printReportOf as shapeReport } from '../three/analysis/shapeReports';
import { ShapeSolid } from '../three/analysis/shapeSolid';

it('delivers one deterministic comparison 3MF with exact identities, transforms, materials and failed values', async () => {
  const design = await generatedFit();
  const comparison = await prepareFitVariants(
    design,
    {
      binding: fitBindings(design)[0],
      fit: 'mate',
      values: [21.9, 22, 22.1, 1000],
      down: [1, 0, 0],
      material: 'PETG',
    },
    { ...fitServices, sourceHash: fitSourceHash, cut: fitVariantCoupons },
  );
  const candidates = comparison.candidates.filter((c) => c.coupon);
  const coupons = candidates.map((c) => c.coupon!);
  const parts = candidates.map((c, i) => ({
    ...couponPart(c.coupon!, design.parts[0], i),
    id: c.id,
    name: `bore = ${c.value} mm`,
  }));
  const printer = resolvePrinter('bambu-lab-p1s', []);
  const report = fitTestReport(coupons, parts, { printer, project: DEFAULT_PROJECT });
  const plates = jobSpec(report.plan, printer, DEFAULT_PROJECT);
  const written = await writeFitPlate({ coupons, parts, plates, comparison });
  const bytes = written.files.PETG;
  const entries = unzipSync(bytes);
  const map: FitPlateIdentity = JSON.parse(strFromU8(entries['Metadata/basecase-fit-test.json']));
  const xml = strFromU8(entries['3D/3dmodel.model']);

  expect(report.plan.plates).toHaveLength(1);
  expect(map.sourceSha256).toBe(await fitSourceHash(design));
  expect(map.interface).toEqual(design.parts[1]);
  expect(map.binding).toEqual(comparison.request.binding);
  expect(map.candidates.map((c) => c.objects)).toEqual([
    ...plates.files[0].items.map((item, i) => [
      { id: i + 1, plate: item.plate, matrix: item.matrix.map((value) => Math.round(value * 1e5) / 1e5) },
    ]),
    [],
  ]);
  expect(map.candidates.map((c) => c.value)).toEqual([21.9, 22, 22.1, 1000]);
  expect(map.candidates[3].reason).toBeTruthy();
  expect(map.candidates.slice(0, 3).every((c) => c.key === 'bearing:bearing|608' && c.material === 'PETG')).toBe(true);
  expect([...xml.matchAll(/<object id=/g)]).toHaveLength(3);
  expect([...xml.matchAll(/<triangle /g)]).toHaveLength(coupons.reduce((n, c) => n + c.positions.length / 9, 0));
  expect((await writeFitPlate({ coupons, parts, plates, comparison })).files.PETG).toEqual(bytes);

  const splitParts = parts.map((part, index) => ({ ...part, print: { ...part.print, plate: index === 2 ? 2 : 1 } }));
  const splitReport = fitTestReport(coupons, splitParts, { printer, project: DEFAULT_PROJECT });
  const splitPlates = jobSpec(splitReport.plan, printer, DEFAULT_PROJECT);
  const split = await writeFitPlate({ coupons, parts: splitParts, plates: splitPlates, comparison });
  const splitEntries = unzipSync(split.files.PETG);
  const splitMap: FitPlateIdentity = JSON.parse(strFromU8(splitEntries['Metadata/basecase-fit-test.json']));
  const builds = new Map(
    [...strFromU8(splitEntries['3D/3dmodel.model']).matchAll(/<item objectid="(\d+)" transform="([^"]+)"/g)].map(
      (match) => [Number(match[1]), match[2].split(' ').map(Number)],
    ),
  );

  expect(splitReport.plan.plates).toHaveLength(2);

  for (const object of splitMap.candidates.flatMap((candidate) => candidate.objects)) {
    const transform = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14].map((index) => object.matrix[index]);

    expect(transform).toEqual(builds.get(object.id));
  }
});

it('applies the choice through the ordinary document transaction, invalidates checks and plates, and retains undo, redo and reopen', async () => {
  const design = await generatedFit();
  const comparison = await prepareFitVariants(
    design,
    {
      binding: fitBindings(design)[0],
      fit: 'mate',
      values: [21.9, 22, 22.1],
      down: [1, 0, 0],
      material: 'PETG',
    },
    { ...fitServices, sourceHash: fitSourceHash, cut: fitVariantCoupons },
  );
  let docs!: SceneDocument;
  let parameters!: DesignParameters;

  function Harness() {
    docs = useSceneDocument({
      parts: design.parts,
      project: { ...DEFAULT_PROJECT, designParameters: design.parameters },
      sceneId: 'bearing',
      sceneName: 'Bearing seat',
      annotations: [],
      globalGoal: '',
    });
    parameters = useDesignParameters({ docs, sceneId: 'bearing', showToast: () => {} });

    return null;
  }

  renderToString(createElement(Harness));

  const fingerprint = readinessFingerprint(design.parts, design.parameters);
  const printer = resolvePrinter('bambu-lab-p1s', []);
  const shapes = async () => {
    const solid = new ShapeSolid(partSoup(docs.partsRef.current[0]));

    try {
      return shapeReport(solid);
    } finally {
      solid.dispose();
    }
  };
  const before = await printReportOf(design.parts.slice(0, 1), { project: DEFAULT_PROJECT, printer }, async () => ({
    host: await shapes(),
  }));
  const edit = fitVariantEdit(comparison, 2, { parts: docs.partsRef.current, parameters: design.parameters });

  expect(await parameters.apply(edit)).toBe(true);
  expect(docs.docRef.current.past).toHaveLength(1);
  expect(docs.projectRef.current.designParameters![0].fitChoice).toMatchObject({ kind: 'design-choice', value: 22.1 });
  expect(readinessFingerprint(docs.partsRef.current, docs.projectRef.current.designParameters)).not.toBe(fingerprint);

  const after = await printReportOf(
    docs.partsRef.current.slice(0, 1),
    { project: DEFAULT_PROJECT, printer },
    async () => ({ host: await shapes() }),
  );

  expect(after.plan.plates[0].hash).not.toBe(before.plan.plates[0].hash);
  expect(sliceLookup(before.plan.plates)(after.plan.plates[0])).toBeUndefined();
  docs.travel({ direction: 'undo' }, () => {});
  expect(docs.partsRef.current).toEqual(design.parts);
  expect(docs.projectRef.current.designParameters).toEqual(design.parameters);
  docs.travel({ direction: 'redo' }, () => {});

  const reopened = await decodeSceneFile(
    await encodeSceneFile({
      name: 'Bearing seat',
      globalGoal: '',
      annotations: [],
      parts: docs.partsRef.current,
      project: docs.projectRef.current,
    }),
  );

  expect(reopened.project!.designParameters).toEqual(docs.projectRef.current.designParameters);
  expect(reopened.parts).toEqual(docs.partsRef.current);
  expect(reopened.parts[1]).toEqual(design.parts[1]);
});
