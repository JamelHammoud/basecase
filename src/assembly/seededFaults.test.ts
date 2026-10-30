import { describe, expect, it } from 'vitest';
import { assemblyIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import type { ScenePart } from '../types/robotics';
import { bracket, LIFT, objectsOf, printed } from './assembly.fixtures';
import { assemblyReport, serviceableIds } from './assemblyReport';
import { fastenerInput } from './fastenerSpec';
import { provenOrderOf } from './provenOrder';

async function check(parts: ScenePart[]) {
  const geometry = await assemblyIn(snapshotShapes(objectsOf(parts)), {
    ...fastenerInput(parts),
    serviceable: serviceableIds(parts),
    budgetMs: 20000,
  });

  return { geometry, report: assemblyReport(parts, geometry) };
}

const problemsOf = async (parts: ScenePart[], id = 'screw-1') =>
  (await check(parts)).geometry.chains.screws.find((c) => c.id === id)?.problems.map((p) => p.code) ?? [];

const edit = (parts: ScenePart[], id: string, change: (p: ScenePart) => ScenePart | null) =>
  parts.flatMap((p) => {
    if (p.id !== id) return [p];

    const next = change(p);

    return next ? [next] : [];
  });

const moved = (p: ScenePart, d: [number, number, number]): ScenePart => ({
  ...p,
  position: p.position.map((v, k) => v + d[k]) as [number, number, number],
});

describe('check_assembly on a clean bracket', () => {
  it('reports nothing', async () => {
    const { geometry, report } = await check(bracket());

    expect(geometry.chains.screws.map((c) => c.problems)).toEqual([[], []]);
    expect(geometry.chains.screws.map((c) => c.endsIn.kind)).toEqual(['insert', 'insert']);
    expect(report.text).toContain('No assembly problems found.');
  });
});

describe('check_assembly finds seeded faults', () => {
  it('a deleted insert leaves the tip in air', async () => {
    expect(await problemsOf(edit(bracket(), 'insert-1', () => null))).toContain('air');
  });

  it('a screw shortened by 4 mm engages too little thread', async () => {
    const parts = edit(bracket(), 'screw-1', (p) => ({
      ...moved(p, [0, 2, 0]),
      hardware: { ...p.hardware!, length: 6 },
    }));

    expect(await problemsOf(parts)).toContain('short');
  });

  it('a screw moved 2 mm sideways runs through solid material', async () => {
    expect(await problemsOf(edit(bracket(), 'screw-1', (p) => moved(p, [2, 0, 0])))).toContain('uncut');
  });

  it('a head sunk 3 mm into its part is buried', async () => {
    expect(await problemsOf(edit(bracket(), 'screw-1', (p) => moved(p, [0, -3, 0])))).toContain('sunk');
  });

  it('a deleted screw leaves its insert without a screw', async () => {
    const { report } = await check(edit(bracket(), 'screw-1', () => null));

    expect(report.text).toContain('insert-1: no screw threads into this insert');
  });

  it('a screw pulled 4 mm out has nothing under its head and too little thread', async () => {
    const problems = await problemsOf(edit(bracket(), 'screw-1', (p) => moved(p, [0, 4, 0])));

    expect(problems).toEqual(expect.arrayContaining(['unseated', 'short']));
  });

  it('a shell enlarged over its screws buries their heads', async () => {
    const parts = edit(bracket(), 'plate', (p) => ({ ...p, dimensions: { ...p.dimensions, height: 8 } }));

    expect(await problemsOf(parts)).toContain('sunk');
    expect(await problemsOf(parts, 'screw-2')).toContain('sunk');
  });

  it('an insert hole blinded from the drive side leaves the shank in solid material', async () => {
    const parts = [
      ...edit(bracket(), 'boss', (p) => ({ ...p, position: [0, LIFT - 10, 0], dimensions: { ...p.dimensions } })),
      printed('skin', { size: [40, 2, 30] }, [0, LIFT - 2, 0]),
    ];

    expect(await problemsOf(parts)).toContain('uncut');
  });

  it('names the screw and the fix in the report', async () => {
    const { report } = await check(edit(bracket(), 'insert-1', () => null));

    expect(report.text).toMatch(/screw-1: end in air .* Add an insert or nut there/);
  });
});

describe('check_assembly on a mirrored design', () => {
  it('gives mirrored parts mirrored verdicts', async () => {
    const parts = [
      ...bracket({ prefix: 'left-', x: -40, cover: true }),
      ...bracket({ prefix: 'right-', x: 40, mirror: true, cover: true }),
    ];
    const { geometry, report } = await check(parts);
    const verdict = (id: string) => JSON.parse(JSON.stringify(report.plan.screws[id]).replaceAll('right-', 'left-'));
    const problems = (id: string) => geometry.chains.screws.find((c) => c.id === id)?.problems;

    expect(verdict('left-screw-1')).toEqual({ verdict: 'note', before: ['left-cover'] });
    expect(verdict('left-screw-2')).toEqual({ verdict: 'pass' });
    expect(verdict('right-screw-2')).toEqual(verdict('left-screw-1'));
    expect(verdict('right-screw-1')).toEqual(verdict('left-screw-2'));
    expect(problems('right-screw-2')).toEqual(problems('left-screw-1'));
    expect(problems('right-screw-1')).toEqual(problems('left-screw-2'));
  });
});

describe('proven build order', () => {
  it('puts the cover on after the screws it hides, with every part placed', async () => {
    const parts = bracket({ cover: true });
    const { geometry } = await check(parts);
    const order = provenOrderOf(parts, geometry);

    expect(order.unproven).toEqual([]);
    expect(order.assembly.at(-1)).toBe('cover');
    expect(order.assembly).toEqual(expect.arrayContaining(['plate', 'boss']));
  });
});
