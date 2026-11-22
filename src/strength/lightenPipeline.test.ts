import { describe, expect, it } from 'vitest';
import { portsOf, worldPort } from '../agent/ports';
import { objectsOf } from '../assembly/assembly.fixtures';
import { assemblyReport, serviceableIds } from '../assembly/assemblyReport';
import { isBlockingRank } from '../assembly/chainLines';
import { fastenerInput } from '../assembly/fastenerSpec';
import { jointsWithChains } from '../assembly/rigJoints';
import { resolvePrinter } from '../data/printers';
import { weld } from '../print/threeMf';
import { assemblyIn, lightenIn, measuresIn, printReportsIn, strengthIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { runEngineering, STRENGTH_CHECK } from '../utils/engineering';
import type { EngineeringInputs, ServoOutput } from '../utils/engineeringTypes';
import { printReportOf } from '../utils/printReport';
import { loadManifold, solidOfMesh } from '../wrap/manifold';
import { lightenedPart } from '../workspace/lighten';
import { frozenInterfaces } from '../workspace/lightenInterfaces';
import { COXA, COXA_JOINT, COXA_NAME, coxaScene } from './fixtures/coxa';
import type { StrengthJob } from './types';

async function checks(parts: ScenePart[], project: ProjectSettings) {
  const scene = snapshotShapes(objectsOf(parts));
  const [geometry, measures] = await Promise.all([
    assemblyIn(scene, { ...fastenerInput(parts), serviceable: serviceableIds(parts), budgetMs: 20000 }),
    measuresIn(scene),
  ]);
  const servoOutputs: Record<string, ServoOutput> = {};

  for (const part of parts) {
    const output = portsOf(part).find((port) => port.kind === 'output');

    if (!output) continue;

    const at = worldPort(part, output);

    servoOutputs[part.id] = { point: at.position, axis: at.axis };
  }

  const input: EngineeringInputs = {
    parts,
    project: { ...project, joints: jointsWithChains(project.joints ?? [], parts, geometry.chains) },
    measures,
    chains: geometry.chains,
    servoOutputs,
  };
  const jobs: StrengthJob[] = [];

  runEngineering({
    ...input,
    strength: (asked) => {
      jobs.push(...asked);

      return asked.map(() => null);
    },
  });

  const readings = await strengthIn(scene, jobs);
  const byKey = new Map(jobs.map((job, i) => [job.key, readings[i]]));
  const report = runEngineering({ ...input, strength: (asked) => asked.map((job) => byKey.get(job.key) ?? null) });

  return { scene, geometry, measures, jobs, report, assembly: assemblyReport(parts, geometry) };
}

async function expectInterfacesPreserved(before: ScenePart, after: ScenePart) {
  const api = await loadManifold();
  const originalMesh = weld(new Float32Array(before.cad!.positions));
  const changedMesh = weld(
    new Float32Array(
      after.sculptMesh!.positions.map((v, i) => {
        const dimensions = [after.dimensions.width, after.dimensions.height, after.dimensions.depth];

        return v * dimensions[i % 3];
      }),
    ),
  );
  const original = solidOfMesh(api, { positions: originalMesh.vertices, indices: originalMesh.indices })!;
  const changed = solidOfMesh(api, { positions: changedMesh.vertices, indices: changedMesh.indices })!;

  expect(changed.status()).toBe('NoError');

  for (const port of portsOf(before)) {
    const { position } = worldPort(before, port);
    const cylinder = api.Manifold.cylinder(6, 3.5, 3.5, 48);
    const turned = cylinder.rotate([0, 90, 0]);
    const region = turned.translate([position[0] - 3, position[1], position[2]]);
    const expected = original.intersect(region);
    const actual = changed.intersect(region);
    const missing = expected.subtract(actual);
    const extra = actual.subtract(expected);

    expect(expected.volume()).toBeGreaterThan(100);
    expect(missing.volume()).toBeLessThan(0.00001);
    expect(extra.volume()).toBeLessThan(0.00001);
    [cylinder, turned, region, expected, actual, missing, extra].forEach((solid) => solid.delete());
  }

  original.delete();
  changed.delete();
}

describe('Lighten through the measured coxa assembly and Checks', () => {
  it('removes at least thirty percent while preserving mounts, assembly, printing and hip load feedback', async () => {
    const { parts, project } = coxaScene();
    const part = parts.find((candidate) => candidate.id === COXA)!;
    const before = await checks(parts, project);
    const frozen = frozenInterfaces({ part, parts, chains: before.geometry.chains, measure: before.measures[COXA] });

    expect(before.jobs).toHaveLength(1);
    expect(before.jobs[0]).toMatchObject({ part: COXA, load: { screws: expect.any(Array) } });
    expect(before.jobs[0].load.screws).toHaveLength(4);
    expect(before.jobs[0].holds).toHaveLength(2);
    expect(before.jobs[0].load.torqueNmm).toBeGreaterThan(50);
    expect(before.report.rows.find((row) => row.check === STRENGTH_CHECK)?.status).toBe('pass');
    expect(before.assembly.lines.filter((line) => isBlockingRank(line.rank))).toEqual([]);

    const result = await lightenIn(before.scene, {
      part: COXA,
      jobs: before.jobs,
      frozen,
      targetShare: 0.5,
      minWallMm: 1.5,
    });
    const changed = lightenedPart(part, result);
    const next = parts.map((candidate) => (candidate.id === COXA ? changed : candidate));
    const after = await checks(next, project);
    const printing = await printReportOf(
      next,
      { project, printer: resolvePrinter('default', []), scene: next },
      (ids, faces) =>
        printReportsIn(snapshotShapes(objectsOf(next.filter((candidate) => ids.includes(candidate.id)))), faces),
    );
    const strength = after.report.rows.find((row) => row.check === STRENGTH_CHECK);

    expect(result.volumeShare).toBeLessThanOrEqual(0.7);
    expect(after.measures[COXA].volumeMm3 / before.measures[COXA].volumeMm3).toBeLessThanOrEqual(0.7);
    expect(portsOf(changed)).toEqual(portsOf(part));
    expect(changed.mates).toEqual(part.mates);
    expect(project.joints).toEqual(coxaScene().project.joints);
    await expectInterfacesPreserved(part, changed);
    expect(after.assembly.lines.filter((line) => isBlockingRank(line.rank))).toEqual([]);
    expect(after.geometry.chains.screws).toHaveLength(6);
    expect(printing.parts.find((printed) => printed.id === COXA)?.issues).toEqual([]);
    expect(strength).toBeDefined();

    if (strength?.status !== 'pass')
      expect(strength?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ ids: [COXA], text: expect.stringContaining(COXA_NAME) })]),
      );

    expect(after.report.joints.find((joint) => joint.joint.id === COXA_JOINT)!.loadNm).toBeLessThan(
      before.report.joints.find((joint) => joint.joint.id === COXA_JOINT)!.loadNm,
    );
    expect(after.report.masses.find((mass) => mass.id === COXA)!.grams).toBeLessThanOrEqual(
      before.report.masses.find((mass) => mass.id === COXA)!.grams * 0.7,
    );
  }, 30000);
});
