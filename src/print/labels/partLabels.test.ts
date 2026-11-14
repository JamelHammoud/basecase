import * as THREE from 'three';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { resolvePrinter } from '../../data/printers';
import { buildGuidePlan } from '../../guide/guidePlan';
import { approximateScene } from '../../guide/guideScene';
import { printReportsIn, threeMfIn } from '../../three/analysis/analysisPool';
import { snapshotShapes } from '../../three/analysis/sceneShapes';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../../types/robotics';
import { printReportOf, shapeKey } from '../../utils/printReport';
import { jobSpec } from '../job';
import { quadrupedFixture } from '../merge/merge.fixtures';
import { fixtureMesh, labelFixture } from './label.fixtures';
import { labelsKey, partLetters, unlabeledNote } from './partLetters';

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

const lettersOf = (parts: ScenePart[]) => partLetters(buildGuidePlan(approximateScene('Bot', parts, []), 'PLA'), parts);

async function platesOf(parts: ScenePart[], project: ProjectSettings = DEFAULT_PROJECT) {
  const report = await printReportOf(parts, { project, printer }, (ids, faces) =>
    printReportsIn(shapesOf(parts.filter((p) => ids.includes(p.id))), faces),
  );

  return { report, spec: jobSpec(report.plan, printer, project) };
}

function modelText(bytes: Uint8Array): string {
  return strFromU8(unzipSync(bytes)['3D/3dmodel.model']);
}

function triangleCounts(bytes: Uint8Array): Record<string, number> {
  const objects = modelText(bytes).split('<object ').slice(1);

  return Object.fromEntries(objects.map((o) => [/name="([^"]+)"/.exec(o)![1], o.split('<triangle ').length - 1]));
}

async function write(parts: ScenePart[], labels?: Record<string, string>) {
  const { spec } = await platesOf(parts);

  return threeMfIn(shapesOf(parts), { files: spec.files, plateSize: spec.plateSize, labels });
}

const parts = labelFixture();

describe('letters on printed parts', () => {
  it('gives a mirrored left and right bracket different letters, each the guide’s', () => {
    const plan = buildGuidePlan(approximateScene('Bot', parts, []), 'PLA');
    const letters = partLetters(plan, parts);
    const guideLetter = (id: string) => plan.items.find((i) => i.partIds.includes(id))!.label;

    expect(letters['bracket-left']).not.toBe(letters['bracket-right']);
    expect(letters['bracket-left']).toBe(guideLetter('bracket-left'));
    expect(letters['bracket-right']).toBe(guideLetter('bracket-right'));
  });

  it('labels the tray, and says why the exposed parts print without theirs', async () => {
    const letters = lettersOf(parts);
    const { files, unlabeled } = await write(parts, letters);
    const plain = await write(parts);
    const [labeled, bare] = [triangleCounts(files.PLA), triangleCounts(plain.files.PLA)];

    expect(labeled['Body Tray']).toBeGreaterThan(bare['Body Tray']);
    expect(labeled['Spare Tag']).toBe(bare['Spare Tag']);
    expect(unlabeled.map((u) => u.id).sort()).toEqual(['bracket-left', 'bracket-right', 'lid', 'tag']);
    expect(unlabeledNote(letters.tag, 'face')).toBe(
      `Letter ${letters.tag} left off: no flat face is hidden, free and big enough`,
    );
  });

  it('leaves a part with Don’t label as it was', async () => {
    const off = parts.map((p) => (p.id === 'tray' ? { ...p, print: { noLabel: true } } : p));
    const letters = lettersOf(off);
    const { files, unlabeled } = await write(off, letters);

    expect(letters.tray).toBeUndefined();
    expect(unlabeled.some((u) => u.id === 'tray')).toBe(false);
    expect(triangleCounts(files.PLA)['Body Tray']).toBe(triangleCounts((await write(off)).files.PLA)['Body Tray']);
  });

  it('keeps plate hashes and tracker keys with labels on, off or turned off per part', async () => {
    const off = parts.map((p) => ({ ...p, print: { noLabel: true } }));
    const on = await platesOf(parts, { ...DEFAULT_PROJECT, labelParts: true });
    const none = await platesOf(off, { ...DEFAULT_PROJECT, labelParts: false });

    expect(on.report.plan.plates.map((p) => p.hash)).toEqual(none.report.plan.plates.map((p) => p.hash));
    expect(parts.map(shapeKey)).toEqual(off.map(shapeKey));
  });

  it('keys slices by what the letters depend on, so a stale slice is never sent', () => {
    const on = { ...DEFAULT_PROJECT, labelParts: true };
    const offTray = parts.map((p) => (p.id === 'tray' ? { ...p, print: { noLabel: true } } : p));

    expect(labelsKey({ ...DEFAULT_PROJECT, labelParts: false }, parts, 'guide-1')).toBe('');
    expect(labelsKey(on, parts, 'guide-1')).toBe(labelsKey(on, labelFixture(), 'guide-1'));
    expect(labelsKey(on, parts, 'guide-1')).not.toBe(labelsKey(on, parts, 'guide-2'));
    expect(labelsKey(on, parts, 'guide-1')).not.toBe(labelsKey(on, offTray, 'guide-1'));
  });

  it('writes the same faces and letters for the same scene', async () => {
    const [a, b] = [await write(parts, lettersOf(parts)), await write(labelFixture(), lettersOf(labelFixture()))];

    expect(modelText(a.files.PLA)).toBe(modelText(b.files.PLA));
    expect(a.unlabeled).toEqual(b.unlabeled);
  });

  it('labels the quadruped’s plates in under 2 s more than writing them plain', async () => {
    const quadruped = quadrupedFixture().parts;
    const letters = lettersOf(quadruped);
    const started = performance.now();

    await write(quadruped);

    const plain = performance.now() - started;
    const again = performance.now();

    await write(quadruped, letters);

    expect(performance.now() - again - plain).toBeLessThan(2000);
  });
});
