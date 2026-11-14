import { describe, expect, it } from 'vitest';
import type { FloorPoint } from '../../cameras/mat/tag36h11';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildRig } from '../../utils/kinematics';
import { partBounds } from '../../utils/selection';
import { buildCase, builderRobot } from '../caseBuilder';
import type { GoalKind } from '../caseGoals';
import type { Case } from '../schema';
import { BASE_TAG_ID, caseMat, matTagCorners, PAPER_MM, paperFor, type CaseMat, type MatRobot } from './matLayout';

const GOALS: GoalKind[] = ['reach', 'path', 'push', 'walk'];
const ROBOTS = ['rover-diff', 'rover-four', 'quad-servo'];
const EDGE_MM = 15;
const MAX_NEIGHBOUR_MM = 1000;

const matRobot = (id: string): MatRobot => {
  const fixture = fixtureRobots().find((r) => r.id === id)!;

  return { rig: buildRig(fixture.joints, fixture.parts), parts: fixture.parts };
};

const examples = ROBOTS.flatMap((id) => {
  const robot = matRobot(id);
  const builder = builderRobot(robot.rig, robot.parts);

  return GOALS.flatMap((goal) => {
    const made = buildCase({ goal, world: 'floor' }, builder);

    return made.ok ? [{ label: `${id} ${goal}`, kase: made.kase, robot }] : [];
  });
});

function matOf(kase: Case, robot: MatRobot, paper: 'a4' | 'letter' = 'a4'): CaseMat {
  const mat = caseMat(kase, robot, paper);

  if (!mat) throw new Error(`${kase.id} has no mat`);

  return mat;
}

type Box = { x0: number; x1: number; z0: number; z1: number };

const tagBox = (center: FloorPoint, size: number): Box => {
  const half = (size * 10) / 8 / 2;

  return { x0: center[0] - half, x1: center[0] + half, z0: center[1] - half, z1: center[1] + half };
};

const inside = (p: FloorPoint, b: Box) => p[0] > b.x0 && p[0] < b.x1 && p[1] > b.z0 && p[1] < b.z1;

function samples(a: FloorPoint, b: FloorPoint): FloorPoint[] {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2) + 1;

  return Array.from({ length: steps + 1 }, (_, i): FloorPoint => {
    const t = i / steps;

    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });
}

function rectSamples(r: { center: FloorPoint; width: number; depth: number }): FloorPoint[] {
  const [hx, hz] = [r.width / 2, r.depth / 2];
  const c: FloorPoint[] = [
    [r.center[0] - hx, r.center[1] - hz],
    [r.center[0] + hx, r.center[1] - hz],
    [r.center[0] + hx, r.center[1] + hz],
    [r.center[0] - hx, r.center[1] + hz],
  ];

  return [...c.flatMap((p, i) => samples(p, c[(i + 1) % 4])), r.center];
}

function overlapsContent(mat: CaseMat, box: Box): boolean {
  const legs = mat.path.slice(1).flatMap((to, i) => samples(mat.path[i], to));
  const rects = [mat.start, ...mat.outlines].flatMap(rectSamples);
  const spotHit = mat.spots.some((s) => {
    const dx = s.center[0] - Math.min(box.x1, Math.max(box.x0, s.center[0]));
    const dz = s.center[1] - Math.min(box.z1, Math.max(box.z0, s.center[1]));

    return Math.hypot(dx, dz) < s.radius;
  });

  return spotHit || [...legs, ...rects].some((p) => inside(p, box));
}

describe('the Case mat layout', () => {
  it('builds every ground goal on every ground fixture', () => {
    expect(examples.length).toBeGreaterThanOrEqual(9);
  });

  it.each(examples)('draws the Case world for $label', ({ kase, robot }) => {
    const mat = matOf(kase, robot);
    const builder = builderRobot(robot.rig, robot.parts);
    const markers = kase.world.objects.filter((o) => o.behavior === 'marker');

    expect(mat.caseId).toBe(kase.id);
    expect(mat.spots).toEqual(
      markers.map((o) => ({ id: o.id, center: [o.position[0], o.position[2]], radius: o.size[0] / 2 })),
    );
    expect(mat.path).toEqual([[builder.pivot[0], builder.pivot[2]], ...mat.spots.map((s) => s.center)]);
    expect(mat.start.center).toEqual([builder.pivot[0], builder.pivot[2]]);
    expect(mat.outlines).toHaveLength(kase.world.objects.length - markers.length);
  });

  it.each(examples)('puts its tags inside their sheets, clear of the drawing, for $label', ({ kase, robot }) => {
    const mat = matOf(kase, robot);
    const ids = mat.tags.map((t) => t.id);

    expect(mat.tags.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids)).toBeLessThan(BASE_TAG_ID);

    for (const tag of mat.tags) {
      const box = tagBox(tag.center, tag.size);
      const sheet = mat.sheets.find((s) =>
        inside(tag.center, { x0: s.x0, x1: s.x0 + s.width, z0: s.z0, z1: s.z0 + s.height }),
      );

      expect(sheet).toBeDefined();
      expect(Math.min(box.x0 - sheet!.x0, sheet!.x0 + sheet!.width - box.x1)).toBeGreaterThanOrEqual(EDGE_MM);
      expect(Math.min(box.z0 - sheet!.z0, sheet!.z0 + sheet!.height - box.z1)).toBeGreaterThanOrEqual(EDGE_MM);
      expect(overlapsContent(mat, box)).toBe(false);
    }

    mat.tags.forEach((tag, i) => {
      const next = mat.tags[(i + 1) % mat.tags.length];

      expect(Math.hypot(next.center[0] - tag.center[0], next.center[1] - tag.center[1])).toBeLessThanOrEqual(
        MAX_NEIGHBOUR_MM + 1e-6,
      );
    });
  });

  it.each(examples)(
    'lays sheets in a grid around the drawing, column 0 at the largest x, for $label',
    ({ kase, robot }) => {
      const mat = matOf(kase, robot);
      const columns = new Set(mat.sheets.map((s) => s.column)).size;
      const rows = new Set(mat.sheets.map((s) => s.row)).size;
      const pageLeftX = Math.max(...mat.sheets.map((s) => s.x0 + s.width));
      const top = Math.max(...mat.sheets.map((s) => s.z0 + s.height));
      const everyPoint = [...mat.path, ...mat.spots.map((s) => s.center)];

      expect(columns).toBeGreaterThanOrEqual(2);
      expect(rows).toBeGreaterThanOrEqual(2);
      expect(mat.sheets).toHaveLength(columns * rows);

      for (const s of mat.sheets) {
        expect(s.x0 + s.width).toBeCloseTo(pageLeftX - s.column * PAPER_MM.a4.width);
        expect(s.z0 + s.height).toBeCloseTo(top - s.row * PAPER_MM.a4.height);
      }

      for (const p of everyPoint) {
        expect(p[0]).toBeLessThanOrEqual(pageLeftX - 100);
        expect(p[0]).toBeGreaterThanOrEqual(pageLeftX - columns * PAPER_MM.a4.width + 100);
        expect(p[1]).toBeLessThanOrEqual(top - 100);
        expect(p[1]).toBeGreaterThanOrEqual(top - rows * PAPER_MM.a4.height + 100);
      }
    },
  );

  it.each(examples)('sets the base tag on top of the robot, facing its front, for $label', ({ kase, robot }) => {
    const mat = matOf(kase, robot);
    const builder = builderRobot(robot.rig, robot.parts);
    const root = robot.parts.filter((p) => robot.rig.robots[0].parts.has(p.id) && !robot.rig.ownerOf.has(p.id));
    const top = Math.max(...root.map((p) => partBounds(p).max[1]));
    const forward = Math.hypot(builder.forward[0], builder.forward[2]);
    const corners = matTagCorners(mat);

    expect(root.length).toBeGreaterThan(0);
    expect(mat.base.id).toBe(BASE_TAG_ID);
    expect(mat.base.center[1]).toBeCloseTo(top);
    expect(mat.base.size % 8).toBe(0);
    expect(mat.base.size).toBeGreaterThanOrEqual(48);
    expect(mat.base.size).toBeLessThanOrEqual(120);
    expect(mat.base.up[0]).toBeCloseTo(builder.forward[0] / forward);
    expect(mat.base.up[1]).toBeCloseTo(builder.forward[2] / forward);
    expect(corners.map((c) => c.id)).toEqual([...mat.tags.map((t) => t.id), BASE_TAG_ID]);
    expect(corners.at(-1)!.corners).toHaveLength(4);
  });

  it('gives an arm Case no mat', () => {
    const robot = matRobot('arm-3dof');
    const made = buildCase({ goal: 'touch', world: 'floor' }, builderRobot(robot.rig, robot.parts));

    if (!made.ok) throw new Error(made.problem);

    expect(caseMat(made.kase, robot, 'a4')).toBeNull();
  });

  it('picks Letter paper where it is the norm', () => {
    expect(paperFor('en-US')).toBe('letter');
    expect(paperFor('es_MX')).toBe('letter');
    expect(paperFor('de-DE')).toBe('a4');
    expect(paperFor('en')).toBe('a4');
  });

  it('sizes sheets to the paper', () => {
    const { kase, robot } = examples[0];
    const a4 = matOf(kase, robot, 'a4');
    const letter = matOf(kase, robot, 'letter');

    expect(a4.sheets[0]).toMatchObject(PAPER_MM.a4);
    expect(letter.sheets[0]).toMatchObject(PAPER_MM.letter);
    expect(letter.sheets).not.toEqual(a4.sheets);
  });
});
