import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolvePrinter } from '../data/printers';
import { fixtureRobots } from '../sim/fixtures/robots';
import { printReportsIn } from '../three/analysis/analysisPool';
import { snapshotShapes } from '../three/analysis/sceneShapes';
import type { PrintQuote, ProjectSettings, ScenePart } from '../types/robotics';
import { bomText, buildBom } from '../utils/bom';
import { printReportOf } from '../utils/printReport';
import { quotesWanted, withQuotes, type QuoteRequest } from './serviceQuotes';

const NOW = new Date('2026-11-13T12:00:00');
const TODAY = '2026-11-13';
const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
const servo: ScenePart = {
  ...rover.parts[0],
  id: 'servo',
  name: 'Feetech STS3215',
  kind: 'component',
  componentId: 'feetech-sts3215',
  componentVariant: 'c001',
};
const roverParts = (copies = 2): ScenePart[] => [
  ...rover.parts.map((p) => (p.id === 'caster_wheel_disc' ? { ...p, print: { copies } } : p)),
  servo,
];
const printer: ProjectSettings = { printer: 'bambu-p1s', material: 'PLA', infillPct: 20, budgetUsd: 400 };
const byService: ProjectSettings = { ...printer, madeBy: 'service' };
const priceOf = (part: string) => 4 + part.length / 4;

function quoted(parts: ScenePart[], project: ProjectSettings, refuse: Record<string, string> = {}): ProjectSettings {
  const asked = quotesWanted(parts, project);
  const replies = asked.map((a) =>
    refuse[a.part] ? { part: a.part, refusal: refuse[a.part] } : { part: a.part, usd: priceOf(a.part) * a.copies },
  );

  return { ...project, quotes: withQuotes(project.quotes, asked, { replies, checkedAt: TODAY, parts }) };
}

const bomOf = (parts: ScenePart[], project: ProjectSettings) =>
  buildBom({ parts, project, purchases: {}, measures: {}, now: NOW });

const printedLines = (parts: ScenePart[], project: ProjectSettings) =>
  bomOf(parts, project).lines.filter((l) => l.category === 'Printed parts');

describe('quoting printed parts from a print service', () => {
  it('gives the rover one Printed parts line per printed shape, with copies, and no Filament', () => {
    const parts = roverParts();
    const bom = bomOf(parts, quoted(parts, byService));

    expect(bom.lines.filter((l) => l.category === 'Filament')).toEqual([]);
    expect(
      bom.lines
        .filter((l) => l.category === 'Printed parts')
        .map((l) => [l.name, l.qty, l.detail, l.lineUsd, l.status, l.quote?.checkedAt]),
    ).toEqual([
      ['caster_wheel_disc', 2, 'PLA', priceOf('caster_wheel_disc') * 2, 'checked', TODAY],
      ['chassis', 1, 'PLA', priceOf('chassis'), 'checked', TODAY],
      ['left_wheel_disc', 1, 'PLA', priceOf('left_wheel_disc'), 'checked', TODAY],
      ['right_wheel_disc', 1, 'PLA', priceOf('right_wheel_disc'), 'checked', TODAY],
    ]);
    expect(bom.lines.some((l) => l.key.startsWith('component:feetech-sts3215'))).toBe(true);
    expect(bomText(bom, {})).toMatch(
      /- 2× caster_wheel_disc \[printed:caster_wheel_disc\] · quoted .+ for 2 by the print service \(checked 2026-11-13\)/,
    );
  });

  it('moves the budget total by exactly the quoted sum', () => {
    const parts = roverParts();
    const project = quoted(parts, byService);
    const quotedSum = project.quotes!.reduce((sum, q) => sum + (q.usd ?? 0), 0);
    const withPrinter = bomOf(parts, printer);
    const filament = withPrinter.lines
      .filter((l) => l.category === 'Filament')
      .reduce((sum, l) => sum + (l.lineUsd ?? l.estUsd ?? 0), 0);

    expect(bomOf(parts, project).totals.estimatedUsd).toBeCloseTo(
      withPrinter.totals.estimatedUsd - filament + quotedSum,
      6,
    );
  });

  it('quotes mirrored left and right parts as two shapes', () => {
    const asked = quotesWanted(roverParts(), byService);
    const wheels = asked.filter((a) => /^(left|right)_wheel_disc$/.test(a.part));

    expect(wheels).toHaveLength(2);
    expect(new Set(wheels.map((w) => w.key)).size).toBe(2);
  });

  it('asks once for a shape with two copies', () => {
    const asked = quotesWanted(roverParts(2), byService);

    expect(asked.filter((a) => a.part === 'caster_wheel_disc').map((a) => a.copies)).toEqual([2]);
    expect(asked.map((a) => a.part).sort()).toEqual([
      'caster_wheel_disc',
      'chassis',
      'left_wheel_disc',
      'right_wheel_disc',
    ]);
  });

  it('requotes only the part whose shape, material or copies changed, and marks its old price stale', () => {
    const parts = roverParts();
    const project = quoted(parts, byService);
    const edits: Array<(p: ScenePart) => ScenePart> = [
      (p) => ({ ...p, dimensions: { ...p.dimensions, width: 150 } }),
      (p) => ({ ...p, printMaterial: 'PETG' }),
      (p) => ({ ...p, print: { copies: 3 } }),
    ];

    for (const edit of edits) {
      const edited = parts.map((p) => (p.id === 'chassis' ? edit(p) : p));

      expect(quotesWanted(edited, project).map((a) => a.part)).toEqual(['chassis']);

      const chassis = printedLines(edited, project).find((l) => l.name === 'chassis')!;

      expect([chassis.status, chassis.lineUsd]).toEqual(['stale', priceOf('chassis')]);
    }

    expect(quotesWanted(parts, { ...project, infillPct: 60 })).toEqual([]);
  });

  it('sends a PETG part as PETG', () => {
    const parts = roverParts().map((p) => (p.id === 'chassis' ? { ...p, printMaterial: 'PETG' as const } : p));

    expect(quotesWanted(parts, byService).find((a) => a.part === 'chassis')!.material).toBe('PETG');
  });

  it('lists a part the service won’t print with its reply and no price', () => {
    const parts = roverParts();
    const project = quoted(parts, byService, { chassis: 'Part is larger than the 250 mm build volume' });
    const chassis = printedLines(parts, project).find((l) => l.name === 'chassis')!;

    expect([chassis.status, chassis.lineUsd, chassis.warning]).toEqual([
      'unchecked',
      undefined,
      'Part is larger than the 250 mm build volume',
    ]);
    expect(bomOf(parts, project).totals.unpriced).toBe(bomOf(parts, quoted(parts, byService)).totals.unpriced + 1);
    expect(quotesWanted(parts, project)).toEqual([]);
  });

  it('restores the Filament section exactly when switching back to a printer', () => {
    const parts = roverParts();
    const { quotes } = quoted(parts, byService);

    expect(bomOf(parts, { ...printer, quotes })).toEqual(bomOf(parts, printer));
    expect(quotesWanted(parts, { ...printer, quotes: [] })).toEqual([]);
  });

  it('replaces a part’s quote, keeps the rest and drops a deleted part’s', () => {
    const old: PrintQuote[] = [
      { part: 'a', key: 'k1', material: 'PLA', copies: 1, usd: 3, checkedAt: '2026-11-01' },
      { part: 'b', key: 'k2', material: 'PLA', copies: 1, usd: 5, checkedAt: '2026-11-01' },
      { part: 'gone', key: 'k4', material: 'PLA', copies: 1, usd: 6, checkedAt: '2026-11-01' },
    ];
    const asked: QuoteRequest[] = [{ part: 'a', key: 'k3', name: 'a', material: 'PETG', copies: 2 }];
    const parts = ['a', 'b'].map((id) => ({ ...rover.parts[0], id, name: id }));
    const ctx = { replies: [{ part: 'a', usd: 8 }], checkedAt: TODAY, parts };

    expect(withQuotes(old, asked, ctx)).toEqual([
      old[1],
      { part: 'a', key: 'k3', material: 'PETG', copies: 2, usd: 8, checkedAt: TODAY },
    ]);
  });
});

describe('a printability blocker', () => {
  it('stays on a part that is still quoted', async () => {
    const huge: ScenePart = {
      ...rover.parts[0],
      id: 'huge',
      name: 'huge',
      dimensions: { width: 400, height: 30, depth: 30 },
    };
    const meshOf = (p: ScenePart) => ({
      id: p.id,
      object: new THREE.Mesh(new THREE.BoxGeometry(p.dimensions.width, p.dimensions.height, p.dimensions.depth)),
    });
    const report = (project: ProjectSettings) =>
      printReportOf([huge], { project, printer: resolvePrinter('bambu-p1s', []) }, (ids, faces) =>
        printReportsIn(snapshotShapes([huge].filter((p) => ids.includes(p.id)).map(meshOf)), faces),
      );
    const project = quoted([huge], byService);
    const issues = (await report(project)).parts[0].issues;

    expect(issues.length).toBeGreaterThan(0);
    expect(issues).toEqual((await report(printer)).parts[0].issues);
    expect(printedLines([huge], project)[0].lineUsd).toBe(priceOf('huge'));
  });
});
