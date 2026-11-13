import { describe, expect, it } from 'vitest';
import { objectsOf } from '../../assembly/assembly.fixtures';
import { assemblyReport } from '../../assembly/assemblyReport';
import { isBlockingRank } from '../../assembly/chainLines';
import { fastenerInput } from '../../assembly/fastenerSpec';
import { evaluateBoolean } from '../../booleans/evaluate';
import { booleanHash } from '../../booleans/hash';
import { withResult } from '../../booleans/parts';
import { buildGuidePlan } from '../../guide/guidePlan';
import { approximateScene } from '../../guide/guideScene';
import { assemblyIn } from '../../three/analysis/analysisPool';
import { snapshotShapes } from '../../three/analysis/sceneShapes';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../../types/robotics';
import { buildBom } from '../../utils/bom';
import type { Bed } from '../bed';
import { mergeDraft, mergedParts } from './mergeApply';
import { mergeInput } from './mergeInput';
import { quadrupedFixture, shinFixture } from './merge.fixtures';
import { mergeLines } from './mergeText';
import { mergeSavings, type MergeGroup } from './mergeTypes';

const BED: Bed = { name: 'Test', width: 256, depth: 256, height: 256, origin: [0, 0], keepOut: [] };
const SHORT_BED: Bed = { ...BED, width: 70, depth: 50, height: 47 };
const BUDGET_MS = 20000;
const SCREW_LINE = 'hardware:socket_head|M3|10';

async function assemblyOf(parts: ScenePart[], merges?: ReturnType<typeof mergeInput>) {
  return assemblyIn(snapshotShapes(objectsOf(parts)), {
    ...fastenerInput(parts),
    serviceable: [],
    budgetMs: BUDGET_MS,
    ...(merges ? { merges } : {}),
  });
}

async function planOf(parts: ScenePart[], { bed = BED, project = DEFAULT_PROJECT as ProjectSettings } = {}) {
  const geometry = await assemblyOf(parts, mergeInput(parts, project, bed));

  return { ...geometry.merges!, workerMs: geometry.ms + geometry.merges!.ms };
}

async function merged(parts: ScenePart[], group: MergeGroup): Promise<ScenePart[]> {
  let n = 0;
  const { draft } = mergeDraft(parts, group, () => `operand-${++n}`)!;
  const result = await evaluateBoolean(draft);

  return mergedParts(parts, group, withResult(draft, booleanHash(draft), result));
}

const screwCount = (parts: ScenePart[]) =>
  buildBom({ parts, project: DEFAULT_PROJECT as ProjectSettings, purchases: {}, measures: {} }).lines.find((l) =>
    l.key.startsWith(SCREW_LINE),
  )?.qty ?? 0;

const guideSteps = (parts: ScenePart[]) => buildGuidePlan(approximateScene('Shin', parts, []), 'PLA').steps.length;

describe('merge planner', () => {
  it('merges the bracket and the foot plate, and keeps the cover apart so the servo goes in', async () => {
    const { groups } = await planOf(shinFixture());

    expect(groups).toEqual([
      {
        keep: 'tray',
        ids: ['tray', 'plate'],
        link: '',
        material: 'PLA',
        screws: ['plate-screw-1', 'plate-screw-2', 'plate-screw-3', 'plate-screw-4'],
        hardware: [
          'plate-insert-1',
          'plate-insert-2',
          'plate-insert-3',
          'plate-insert-4',
          'plate-screw-1',
          'plate-screw-2',
          'plate-screw-3',
          'plate-screw-4',
        ],
        steps: 2,
        left: [{ id: 'lid', why: { code: 'seals', part: 'servo' } }],
      },
    ]);
    expect(mergeSavings(groups[0])).toEqual({ parts: 1, screws: 4, steps: 2 });
  });

  it('lists the same group for the agent, with the part left out and why', async () => {
    const parts = shinFixture();
    const names = new Map(parts.map((p) => [p.id, p.name]));
    const { groups } = await planOf(parts);

    expect(mergeLines(groups, (id) => names.get(id) ?? id)).toEqual([
      'Could print as one part (merge_parts with these ids, only when the user asks):',
      '- ids=[tray, plate] Shin Bracket and Foot Plate: −1 part, −4 screws, −2 steps.',
      '  Servo Cover stays separate so Knee Servo can go in.',
    ]);
  });

  it('never groups parts of different materials', async () => {
    expect((await planOf(shinFixture({ plateMaterial: 'PETG' }))).groups).toEqual([]);
  });

  it('never offers a union that overflows the bed', async () => {
    expect((await planOf(shinFixture(), { bed: SHORT_BED })).groups).toEqual([]);
  });

  it('gives the same plan on every run', async () => {
    const [a, b] = await Promise.all([planOf(shinFixture()), planOf(shinFixture())]);

    expect(a.groups).toEqual(b.groups);
  });

  it('drops the joining screws from the BOM, still assembles and shortens the guide', async () => {
    const parts = shinFixture();
    const { groups } = await planOf(parts);
    const after = await merged(parts, groups[0]);
    const report = assemblyReport(after, await assemblyOf(after));

    expect(after.map((p) => p.id)).not.toContain('plate');
    expect(after.find((p) => p.id === 'tray')?.kind).toBe('boolean');
    expect([screwCount(parts), screwCount(after)]).toEqual([8, 4]);
    expect(report.lines.filter((l) => isBlockingRank(l.rank))).toEqual([]);
    expect(report.plan.stuckParts).toEqual([]);
    expect(guideSteps(parts) - guideSteps(after)).toBe(mergeSavings(groups[0]).steps);
  }, 30000);

  it('plans the quadruped in the worker in under 2 s', async () => {
    const { parts, joints } = quadrupedFixture();
    const plan = await planOf(parts, { project: { ...(DEFAULT_PROJECT as ProjectSettings), joints } });

    expect(plan.groups.map((g) => g.ids)).toEqual(
      ['fl', 'fr', 'rl', 'rr'].map((leg) => [`${leg}-tray`, `${leg}-plate`]),
    );
    expect(plan.workerMs).toBeLessThan(2000);
  }, 30000);
});
