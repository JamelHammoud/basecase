import { describe, expect, it } from 'vitest';
import { assemblyIn, interferenceIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import type { ScenePart } from '../types/robotics';
import { designedFits } from '../utils/designedFits';
import { hardwareDimensions, type HardwareSpec } from '../data/hardware';
import { assemblyFindings } from '../readiness/findings';
import { bracket, hardware, LIFT, objectsOf, printed, screwSeatedAt } from './assembly.fixtures';
import { assemblyReport, serviceableIds } from './assemblyReport';
import { fastenerInput } from './fastenerSpec';
import { heldBy } from './heldBy';
import { provenOrderOf } from './provenOrder';
import { serviceClass } from './serviceDepth';

async function check(parts: ScenePart[], budgetMs = 20000) {
  const geometry = await assemblyIn(snapshotShapes(objectsOf(parts)), {
    ...fastenerInput(parts),
    serviceable: serviceableIds(parts),
    budgetMs,
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

    expect(report.text).toContain('insert-1: no screw threads into the insert');
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

describe('faults the buildability audits kept finding', () => {
  it('a board held by nothing blocks the build', async () => {
    const parts = [...bracket(), printed('loose', { size: [10, 2, 10] }, [80, 40, 0])];
    const { report } = await check(parts);

    expect(report.lines.find((l) => l.text.includes('held by nothing'))?.ids).toContain('loose');
    expect(report.text).toContain('BLOCKER: loose');
  });

  it('every part of a clean bracket comes out', async () => {
    const { report } = await check(bracket());

    expect(report.plan.stuckParts).toEqual([]);
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

const M3X8: HardwareSpec = { type: 'socket_head', size: 'M3', length: 8 };
const flipped = (p: ScenePart, y: number): ScenePart => ({
  ...p,
  position: [p.position[0], y, p.position[2]],
  rotation: [180, 0, 0],
});
const clearance = { x: 0, z: 0, r: 1.7 };
const blockersOf = async (parts: ScenePart[]) =>
  assemblyFindings((await check(parts)).report)
    .filter((f) => f.level === 'blocker')
    .map((f) => f.rule);

function boardOnStandoff(type: 'standoff_ff' | 'standoff_mf') {
  const spec: HardwareSpec = { type, size: 'M3', length: 10 };
  const { height } = hardwareDimensions(spec);
  const stud = height - 10;
  const boardY = 10 + 4;
  const reference = screwSeatedAt('x', M3X8, { x: 0, z: 0, seatY: 0 });

  return [
    printed('base', { size: [60, 4, 40], holes: [clearance] }, [0, 0, 0]),
    hardware('standoff', spec, [0, 4 - stud + height / 2, 0]),
    printed('board', { size: [30, 3, 30], holes: [clearance] }, [0, boardY, 0]),
    screwSeatedAt('top', M3X8, { x: 0, z: 0, seatY: boardY + 3 }),
    ...(type === 'standoff_ff'
      ? [flipped(screwSeatedAt('bottom', M3X8, { x: 0, z: 0, seatY: 0 }), -reference.position[1])]
      : []),
  ];
}

describe('screws into threaded hardware', () => {
  it('a board on a female-female standoff, screwed from both sides, is sound', async () => {
    expect(await blockersOf(boardOnStandoff('standoff_ff'))).toEqual([]);
  });

  it('a board on a male-female standoff is sound', async () => {
    expect(await blockersOf(boardOnStandoff('standoff_mf'))).toEqual([]);
  });

  it('a screw threaded into its standoff isn’t a clash', async () => {
    const parts = boardOnStandoff('standoff_ff');
    const scene = snapshotShapes(objectsOf(parts));
    const { geometry } = await check(parts);
    const found = await interferenceIn(scene, { toleranceMm: 0.3, maxSamples: 400 });

    expect(designedFits(found, parts, geometry.chains).items).toEqual([]);
  });

  it('still reports a board with nothing fastening the far end of its standoff', async () => {
    const parts = boardOnStandoff('standoff_ff').filter((p) => p.id !== 'bottom');

    expect(await blockersOf(parts)).toContain('unheld');
  });

  it('a screw into a T-nut is sound', async () => {
    const nut: HardwareSpec = { type: 't_nut', size: 'M3' };
    const { height } = hardwareDimensions(nut);
    const parts = [
      printed('rail', { size: [60, 10, 40] }, [0, -10, 0]),
      hardware('tnut', nut, [0, height / 2, 0]),
      printed('bracket', { size: [30, 4, 30], holes: [clearance] }, [0, height, 0]),
      screwSeatedAt('screw-1', M3X8, { x: 0, z: 0, seatY: height + 4 }),
    ];

    expect((await check(parts)).geometry.chains.screws[0].endsIn.kind).toBe('nut');
    expect(await problemsOf(parts)).toEqual([]);
  });

  it('a part screwed into a rail carriage is held, with nothing in the air', async () => {
    const carriage = hardware('carriage', { type: 'rail_carriage', size: 'MGN12C' }, [0, 10, 0]);
    const top = 10 + carriage.dimensions.height / 2;
    const parts = [
      printed('base', { size: [80, 4, 80] }, [0, -40, 0]),
      printed('slider', { size: [40, 4, 30], holes: [clearance] }, [0, top, 0]),
      carriage,
      screwSeatedAt('screw-1', M3X8, { x: 0, z: 0, seatY: top + 4 }),
    ];
    const { geometry } = await check(parts);

    expect(geometry.chains.screws[0].problems.map((p) => p.code)).not.toContain('air');
    expect(geometry.chains.screws[0].endsIn).toEqual({ kind: 'component', id: 'carriage' });
  });

  it('a head resting on a flanged bearing has something under it', async () => {
    const bearing = hardware('bearing', { type: 'bearing', size: '623' }, [0, 0, 0]);
    const top = bearing.dimensions.height / 2;
    const parts = [
      bearing,
      printed('base', { size: [40, 10, 40], holes: [{ x: 0, z: 0, r: 1.25 }] }, [0, -top - 10, 0]),
      screwSeatedAt('screw-1', M3X8, { x: 0, z: 0, seatY: top }),
    ];

    expect(await problemsOf(parts)).not.toContain('unseated');
  });
});

describe('a hub on a set screw', () => {
  const setScrew = hardware('grub', { type: 'set_screw', size: 'M3', length: 6 }, [0, 26, 0]);
  const hub = printed('hub', { size: [30, 9, 30], holes: [clearance] }, [0, 20, 0]);
  const frame = printed('frame', { size: [60, 4, 40] }, [0, 0, 0]);

  it('is held when the set screw reaches something to press on', async () => {
    const shaft = printed('shaft', { size: [8, 4, 8] }, [0, 29.2, 0]);
    const { unheld } = heldBy([hub, shaft, frame, setScrew], (await check([hub, shaft, frame, setScrew])).geometry);

    expect(unheld).not.toContain('hub');
    expect(unheld).toContain('frame');
  });

  it('is loose when nothing but the hub touches the set screw', async () => {
    const { unheld } = heldBy([hub, frame, setScrew], (await check([hub, frame, setScrew])).geometry);

    expect(unheld).toContain('hub');
  });
});

describe('batteries added as a supply', () => {
  it.each(['lipo-2s-2200', 'lipo-3s-2200'])('%s counts as a battery for repairs', (supplyId) => {
    expect(serviceClass({ supplyId } as ScenePart)).toBe('battery');
  });

  it('a pack sealed in six walls has a repair row', async () => {
    const pack = { ...printed('pack', { size: [30, 20, 30] }, [0, 40, 0]), supplyId: 'lipo-3s-2200' };
    const walls = [
      printed('floor', { size: [100, 4, 100] }, [0, 30, 0]),
      printed('roof', { size: [100, 4, 100] }, [0, 64, 0]),
      printed('w1', { size: [4, 30, 100] }, [-48, 34, 0]),
      printed('w2', { size: [4, 30, 100] }, [48, 34, 0]),
      printed('w3', { size: [92, 30, 4] }, [0, 34, 48]),
      printed('w4', { size: [92, 30, 4] }, [0, 34, -48]),
    ];

    expect((await check([...walls, pack])).report.service.map((r) => [r.id, r.cls])).toEqual([['pack', 'battery']]);
  });
});

describe('running out of time', () => {
  it('never calls an unmeasured screw stuck, and blocks the verdict', async () => {
    const { report } = await check(bracket(), 0);
    const findings = assemblyFindings(report);

    expect(findings.map((f) => f.rule)).not.toContain('stuck-screw');
    expect(Object.values(report.plan.screws).every((v) => v.verdict === 'not run')).toBe(true);
    expect(findings.filter((f) => f.rule === 'unfinished').map((f) => f.level)).toEqual(['blocker']);
  });

  it('a run cut short after the drivers still can’t read as ready', async () => {
    const parts = [...bracket(), printed('loose', { size: [10, 2, 10] }, [80, 40, 0])];
    const { geometry } = await check(parts);
    const cut = {
      ...geometry,
      timedOut: true,
      moves: Object.fromEntries(Object.entries(geometry.moves).slice(0, 1)),
      fits: { insertWalls: {}, leadRoomMm: {} },
    };

    expect(assemblyFindings(assemblyReport(parts, cut)).map((f) => f.level)).toContain('blocker');
  });

  it('a finished run says nothing about time', async () => {
    expect(assemblyFindings((await check(bracket())).report).map((f) => f.rule)).not.toContain('unfinished');
  });
});
