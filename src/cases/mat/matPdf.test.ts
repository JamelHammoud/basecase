import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildRig } from '../../utils/kinematics';
import { buildCase, builderRobot } from '../caseBuilder';
import type { GoalKind } from '../caseGoals';
import { BASE_TAG_ID, caseMat, matTagCorners, PAPER_MM, type CaseMat, type MatRobot } from './matLayout';
import { matPdf, PT_PER_MM } from './matPdf';

const GOALS: GoalKind[] = ['reach', 'path', 'push', 'walk'];
const ROBOTS = ['rover-diff', 'rover-four', 'quad-servo'];
const TOLERANCE_MM = 0.01;

const matRobot = (id: string): MatRobot => {
  const fixture = fixtureRobots().find((r) => r.id === id)!;

  return { rig: buildRig(fixture.joints, fixture.parts), parts: fixture.parts };
};

const examples = ROBOTS.flatMap((id) => {
  const robot = matRobot(id);
  const builder = builderRobot(robot.rig, robot.parts);

  return GOALS.flatMap((goal) => {
    const made = buildCase({ goal, world: 'floor' }, builder);
    const mat = made.ok ? caseMat(made.kase, robot, 'a4') : null;

    return mat ? [{ label: `${id} ${goal}`, mat, made, robot }] : [];
  });
});

const textOf = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

function objects(text: string): Map<number, string> {
  const found = new Map<number, string>();

  for (const m of text.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) found.set(Number(m[1]), m[2]);

  return found;
}

function pageContents(text: string): string[] {
  const all = objects(text);
  const catalog = /\/Root (\d+) 0 R/.exec(text)!;
  const pagesId = /\/Pages (\d+) 0 R/.exec(all.get(Number(catalog[1]))!)![1];
  const kids = /\/Kids \[([^\]]*)\]/.exec(all.get(Number(pagesId))!)![1];

  return [...kids.matchAll(/(\d+) 0 R/g)].map((kid) => {
    const page = all.get(Number(kid[1]))!;
    const contents = /\/Contents (\d+) 0 R/.exec(page)![1];

    return /stream\n([\s\S]*)\nendstream/.exec(all.get(Number(contents))!)![1];
  });
}

interface Placement {
  id: number;
  center: [number, number];
  size: number;
}

function placements(content: string): Placement[] {
  const pattern = /q (\S+) 0 0 (\S+) (\S+) (\S+) cm \/T(\d+) Do Q/g;

  return [...content.matchAll(pattern)].map((m) => {
    const [a, d, e, f] = [m[1], m[2], m[3], m[4]].map(Number);

    expect(d).toBe(a);

    return { id: Number(m[5]), center: [(e + 5 * a) / PT_PER_MM, (f + 5 * a) / PT_PER_MM], size: (8 * a) / PT_PER_MM };
  });
}

const rowMajor = (mat: CaseMat) => [...mat.sheets].sort((a, b) => a.row - b.row || a.column - b.column);

describe('the Case mat PDF', () => {
  it.each(examples)('is a well-formed PDF for $label', ({ mat }) => {
    const text = textOf(matPdf(mat));
    const xrefAt = Number(/startxref\n(\d+)\n%%EOF\s*$/.exec(text)![1]);
    const xref = /^xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(text.slice(xrefAt))!;
    const mediaBox = /\/MediaBox \[0 0 (\S+) (\S+)\]/.exec(text)!;
    const offsets = xref[2]
      .split('\n')
      .filter(Boolean)
      .slice(1)
      .map((line) => Number(line.slice(0, 10)));

    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(offsets).toHaveLength(Number(xref[1]) - 1);
    offsets.forEach((offset, i) => expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(mat.sheets.length + 1);
    expect(text.match(/\/Subtype \/Form/g)).toHaveLength(mat.tags.length + 1);

    expect(Number(mediaBox[1]) / PT_PER_MM).toBeCloseTo(PAPER_MM.a4.width, 2);
    expect(Number(mediaBox[2]) / PT_PER_MM).toBeCloseTo(PAPER_MM.a4.height, 2);
  });

  it.each(examples)('prints each mat tag where the Case world puts it for $label', ({ mat }) => {
    const pages = pageContents(textOf(matPdf(mat)));
    const sheets = rowMajor(mat);
    const printed = sheets.flatMap((sheet, i) =>
      placements(pages[i]).map((p) => ({
        ...p,
        center: [sheet.x0 + sheet.width - p.center[0], p.center[1] + sheet.z0],
      })),
    );

    expect(pages).toHaveLength(sheets.length + 1);
    expect(printed.map((p) => p.id).sort((a, b) => a - b)).toEqual(mat.tags.map((t) => t.id));

    for (const tag of mat.tags) {
      const at = printed.find((p) => p.id === tag.id)!;

      expect(Math.abs(at.center[0] - tag.center[0])).toBeLessThan(TOLERANCE_MM);
      expect(Math.abs(at.center[1] - tag.center[1])).toBeLessThan(TOLERANCE_MM);
      expect(Math.abs(at.size - tag.size)).toBeLessThan(TOLERANCE_MM);
    }
  });

  it.each(examples)('prints each black square with the corners the tracker expects for $label', ({ mat }) => {
    const pages = pageContents(textOf(matPdf(mat)));
    const expected = new Map(matTagCorners(mat).map((t) => [t.id, t.corners]));
    const upright: Array<[number, number]> = [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1],
    ];

    rowMajor(mat).forEach((sheet, i) => {
      for (const p of placements(pages[i])) {
        const half = p.size / 2;
        const onFloor = upright.map(([sx, sy]) => [
          sheet.x0 + sheet.width - (p.center[0] + sx * half),
          sheet.z0 + p.center[1] + sy * half,
        ]);

        onFloor.forEach((corner, k) => {
          expect(Math.abs(corner[0] - expected.get(p.id)![k][0])).toBeLessThan(TOLERANCE_MM);
          expect(Math.abs(corner[1] - expected.get(p.id)![k][1])).toBeLessThan(TOLERANCE_MM);
        });
      }
    });
  });

  it.each(examples)('ends with the base tag at true size, centred, for $label', ({ mat }) => {
    const pages = pageContents(textOf(matPdf(mat)));
    const [base] = placements(pages.at(-1)!);
    const paper = PAPER_MM[mat.paper];

    expect(base.id).toBe(BASE_TAG_ID);
    expect(Math.abs(base.size - mat.base.size)).toBeLessThan(TOLERANCE_MM);
    expect(Math.abs(base.center[0] - paper.width / 2)).toBeLessThan(TOLERANCE_MM);
    expect(Math.abs(base.center[1] - paper.height / 2)).toBeLessThan(TOLERANCE_MM);
  });

  it('labels each sheet by row letter and column number', () => {
    const { mat } = examples[0];
    const pages = pageContents(textOf(matPdf(mat)));
    const labels = pages.slice(0, -1).map((content) => /\((\w+)\) Tj/.exec(content)![1]);

    expect(labels.slice(0, 3)).toEqual(['A1', 'A2', 'A3']);
    expect(labels).toContain(`${String.fromCharCode(64 + Math.max(...mat.sheets.map((s) => s.row + 1)))}1`);
    expect(pages.at(-1)).not.toContain('Tj');
  });

  it('gives the same bytes for the same Case', () => {
    const { made, robot } = examples[1];

    if (!made.ok) throw new Error(made.problem);

    expect(matPdf(caseMat(made.kase, robot, 'letter')!)).toEqual(matPdf(caseMat(made.kase, robot, 'letter')!));
  });
});
