import { isPrinted } from '../utils/bom';
import { itemKeyOf } from '../guide/guideItems';
import { expect, it } from 'vitest';
import { bracket, objectsOf } from '../assembly/assembly.fixtures';
import { provenOrderOf } from '../assembly/provenOrder';
import { buildGuidePlan } from '../guide/guidePlan';
import { approximateScene } from '../guide/guideScene';
import { printMeshesIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { retainedRepairGeometry } from './buildRepairGeometry';
import { planBuildRevisionRepair } from './buildRepairPlan';
import type { FrozenKit } from './frozenKit';
import { kitFixture } from './kit.fixtures';
import { freezeBuildKit, readFrozenKit } from './frozenKit';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { weld } from '../print/threeMf';

async function measuredKit(parts: ScenePart[]) {
  const job = kitFixture('differential rover');
  const triangles = fixtureTriangles(job.parts);
  const meshes = Object.fromEntries(job.parts.map((part) => [part.id, weld(triangles(part.id)!)]));
  const kit: FrozenKit = readFrozenKit(await freezeBuildKit({ job, meshes }));
  const captured = await printMeshesIn(snapshotShapes(objectsOf(parts)));

  kit.parts = parts;
  kit.project = { ...DEFAULT_PROJECT, labelParts: false, joints: [] };
  kit.geometry = Object.fromEntries(
    Object.entries(captured).map(([id, mesh]) => [
      id,
      { positions: Array.from(mesh.vertices), indices: Array.from(mesh.indices) },
    ]),
  );
  kit.manifest.checks = {
    freshness: 'current',
    result: {
      status: 'ready',
      checks: [],
      blockers: [],
      notes: [],
      ignored: [],
      ignoredRules: [],
      findings: [],
      rows: [],
      fingerprint: 'fixture-checks',
      checkedAt: '2026-11-20T12:00:00Z',
    },
  };
  delete kit.manifest.wiring;

  const printed = kit.manifest.printed[0];

  kit.manifest.printed = parts.filter(isPrinted).map((part) => ({
    ...printed,
    id: part.id,
    name: part.name,
    key: itemKeyOf(part),
    material: part.printMaterial ?? kit.project.material,
  }));
  kit.manifest.packing = parts.map((part) => ({
    key: itemKeyOf(part),
    name: part.name,
    qty: 1,
    unit: 'pcs',
    partIds: [part.id],
    module: null,
    step: null,
    index: null,
  }));

  const measured = retainedRepairGeometry(kit, ['plate']);
  const scene = approximateScene('Measured bracket', parts, []);

  kit.manifest.guide = buildGuidePlan(
    { ...scene, boxes: measured.boxes, order: provenOrderOf(parts, measured.geometry) },
    kit.project.material,
  );

  return kit;
}

it('proves source removal and replacement reassembly against their own retained meshes', async () => {
  const source = await measuredKit(bracket({ cover: true }));
  const target = structuredClone(source);
  const sourceBytes = JSON.stringify(source);

  target.parts.find((part) => part.id === 'plate')!.printMaterial = 'PETG';

  const result = planBuildRevisionRepair(source, target);

  expect(result.refusal).toBeNull();
  expect(result.comparison.replacements).toEqual(['plate']);
  expect(result.phases.map((phase) => phase.revision)).toEqual(['source', 'target']);
  expect(result.phases[0].plan.steps.every((step) => step.repairPhase === 'remove')).toBe(true);
  expect(result.phases[0].plan.steps.flatMap((step) => step.partIds)).toEqual(['screw-2', 'cover', 'screw-1', 'plate']);
  expect(result.phases[1].plan.steps[0].repairPhase).toBe('swap');
  expect(result.phases[1].plan.steps.at(-1)!.shownIds).toEqual(expect.arrayContaining(source.manifest.guide.partIds));
  expect(JSON.stringify(source)).toBe(sourceBytes);
});

it('refuses newly obstructed target geometry even when the source has a proven teardown', async () => {
  const source = await measuredKit(bracket());
  const target = structuredClone(source);
  const boss = target.geometry.boss;

  boss.positions = boss.positions.map((value) => value * 20);
  target.parts.find((part) => part.id === 'boss')!.printMaterial = 'PETG';

  const result = planBuildRevisionRepair(source, target);

  expect(result.refusal).toBe('access');
  expect(result.phases).toEqual([]);
});

it('uses the replacement mesh bounds and proves a changed plate without rewriting the source plan', async () => {
  const source = await measuredKit(bracket());
  const target = structuredClone(source);

  target.geometry.plate.positions = target.geometry.plate.positions.map((value, index) =>
    index % 3 === 0 ? value * 1.1 : value,
  );
  target.parts.find((part) => part.id === 'plate')!.dimensions.width *= 1.1;

  const before = JSON.stringify(source);
  const result = planBuildRevisionRepair(source, target);

  expect(result.refusal).toBeNull();
  expect(result.comparison.replacements).toEqual(['plate']);
  expect(result.phases[1].plan.steps.some((step) => step.repairPhase === 'reassemble')).toBe(true);
  expect(JSON.stringify(source)).toBe(before);
});

it('requires fresh target Checks before deriving any physical plan', async () => {
  const source = await measuredKit(bracket());
  const target = structuredClone(source);

  target.parts[0].printMaterial = 'PETG';
  target.manifest.checks.freshness = 'stale';
  expect(planBuildRevisionRepair(source, target).refusal).toBe('checks');
  target.manifest.checks.freshness = 'current';
  target.manifest.checks.result!.status = 'blocked';
  expect(planBuildRevisionRepair(source, target).refusal).toBe('checks');
});

it('does not derive physical replacement actions for a presentation-only revision', async () => {
  const source = await measuredKit(bracket());
  const target = structuredClone(source);

  target.parts[0].name = 'New name';
  target.parts[0].color = '#222222';

  const result = planBuildRevisionRepair(source, target);

  expect(result.refusal).toBeNull();
  expect(result.comparison.replacements).toEqual([]);
  expect(result.phases).toEqual([]);
});

it('refuses topology, placement and unmatched identity changes without a partial plan', async () => {
  const source = await measuredKit(bracket());
  const moved = structuredClone(source);

  moved.parts[0].position[0] += 10;
  expect(planBuildRevisionRepair(source, moved).refusal).toBe('topology');

  const missing = structuredClone(source);

  missing.parts[0].id = 'other';
  expect(planBuildRevisionRepair(source, missing).refusal).toBe('identity');
});

it('supports a bounded group whose deepest teardown covers both replacements', async () => {
  const parts = bracket({ cover: true }).map((part) =>
    ['plate', 'cover'].includes(part.id) ? { ...part, group: { id: 'service-group', name: 'Service group' } } : part,
  );
  const source = await measuredKit(parts);
  const target = structuredClone(source);

  target.parts = target.parts.map((part) =>
    ['plate', 'cover'].includes(part.id) ? { ...part, printMaterial: 'PETG' } : part,
  );

  const result = planBuildRevisionRepair(source, target);

  expect(result.refusal).toBeNull();
  expect(result.comparison.replacements).toEqual(['cover', 'plate']);
  expect(result.phases[1].plan.steps.find((step) => step.repairPhase === 'swap')!.partIds).toEqual(['cover', 'plate']);
});

it('refuses print settings whose exact manufacturing compatibility is absent from copy evidence', async () => {
  const source = await measuredKit(bracket());
  const target = structuredClone(source);

  target.project.infillPct += 10;
  expect(planBuildRevisionRepair(source, target).refusal).toBe('manufacturing');
});
