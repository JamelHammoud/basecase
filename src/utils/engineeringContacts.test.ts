import { describe, expect, it } from 'vitest';
import type { MeshMeasure } from '../three/meshMeasure';
import { runEngineering } from './engineering';
import { box, component, part, project, row, run, type Measures, type V3 } from './engineering.fixtures';

const withBase = (m: MeshMeasure, base: Array<[number, number]>): MeshMeasure => ({ ...m, base });

const patch = (x: number, z: number, r = 2): Array<[number, number]> => [
  [x - r, z - r],
  [x + r, z - r],
  [x + r, z + r],
  [x - r, z + r],
];

describe('Standing stability from where parts meet the floor', () => {
  it('shares one support measurement between the check and the numeric report', () => {
    let reads = 0;
    const parts = Array.from({ length: 40 }, (_, i) => part(`foot${i}`, { massG: 100 }));
    const measures: Measures = Object.fromEntries(
      parts.map((p, i) => [
        p.id,
        {
          ...box([i * 20 - 10, 0, -10], [i * 20 + 10, 20, 10]),
          get base() {
            reads += 1;

            return patch(i * 20, 0, 10);
          },
        },
      ]),
    );
    const report = run({ parts, measures, joints: [] });

    expect(report.stability).toEqual({ marginMm: 10, heightMm: 10, tipDeg: 45, onALine: false });
    expect(row(report, 'Standing stability')).toMatchObject({
      status: 'pass',
      detail: 'Center of mass 10 mm inside the outline of the feet, 10 mm up: tips past 45°',
    });
    expect(reads).toBe(parts.length * 2);
  });

  it('remeasures support after a scene edit', () => {
    const foot = part('foot', { massG: 100 });
    const scene = {
      parts: [foot],
      measures: { foot: withBase(box([-10, 0, -10], [10, 20, 10]), patch(0, 0, 10)) },
      joints: [],
    };
    const before = run(scene);

    scene.measures.foot = withBase(scene.measures.foot, patch(30, 0, 10));

    const after = run(scene);

    expect(before.stability?.marginMm).toBe(10);
    expect(after.stability?.marginMm).toBe(-20);
    expect(row(before, 'Standing stability')?.status).toBe('pass');
    expect(row(after, 'Standing stability')?.status).toBe('fail');
  });

  it.each([{ parts: [] }, { parts: [part('floating', { massG: 100 })] }])(
    'omits both stability results without floor contact: $parts.length parts',
    ({ parts }) => {
      const report = run({ parts, measures: { floating: box([-10, 30, -10], [10, 50, 10]) }, joints: [] });

      expect(report.stability).toBeUndefined();
      expect(row(report, 'Standing stability')).toBeUndefined();
    },
  );

  const onBall = (base?: Array<[number, number]>) => {
    const ball = box([-50, 0, -50], [50, 100, 50]);

    return run({
      parts: [part('body', { massG: 2000 }), part('ball', { massG: 200 })],
      measures: { body: box([-40, 100, -40], [40, 200, 40]), ball: base ? withBase(ball, base) : ball },
      joints: [],
    });
  };

  it('fails a robot balanced on one ball, whose outline is a wide box', () => {
    expect(row(onBall(patch(0, 0)), 'Standing stability')?.status).toBe('fail');
    expect(row(onBall(), 'Standing stability')?.status).toBe('pass');
  });

  const cart = (comX: number, exact = true) => {
    const outlineOnly = (m: MeshMeasure) => (exact ? m : { ...m, base: undefined });
    const wheel = (x: number): MeshMeasure =>
      withBase(box([x - 15, 0, -60], [x + 15, 120, 60]), [
        [x - 15, -5],
        [x + 15, -5],
        [x + 15, 5],
        [x - 15, 5],
      ]);
    const measures: Measures = {
      body: box([comX - 20, 120, 80], [comX + 20, 160, 120]),
      wheelL: outlineOnly(wheel(-100)),
      wheelR: outlineOnly(wheel(100)),
      caster: outlineOnly(withBase(box([-20, 0, 180], [20, 40, 220]), patch(0, 200, 1))),
    };

    return run({
      parts: [part('body', { massG: 3000 }), ...['wheelL', 'wheelR', 'caster'].map((id) => part(id, { massG: 50 }))],
      measures,
      joints: [],
    });
  };

  it('uses the strip under each wheel and the point under a caster', () => {
    expect(row(cart(0), 'Standing stability')?.status).toBe('pass');
    expect(row(cart(79), 'Standing stability')?.status).toBe('fail');
    expect(row(cart(79, false), 'Standing stability')?.status).not.toBe('fail');
  });
});

describe('Heat near servos from the meshes', () => {
  const servo = box([-20, 140, -12], [20, 165, 12], 30000);
  const heat = (shell: MeshMeasure, touches?: string[]) => {
    const r = runEngineering({
      parts: [part('shell', { printMaterial: 'PLA' }), component('s', 'feetech-sts3215', { componentVariant: 'c018' })],
      project: project({ material: 'PLA' }),
      measures: { shell, s: servo },
      servoOutputs: {},
      servoTouches: touches,
    });

    return row(r, 'Heat near servos')!;
  };
  const bracket = box([-26, 130, -20], [26, 175, 20], 9000);

  it('clears a bracket whose outline overlaps a servo when its mesh stands clear', () => {
    expect(heat(bracket).status).toBe('warn');
    expect(heat(bracket, [])).toMatchObject({
      status: 'pass',
      detail: 'Parts within 1 mm of a servo are in heat-tolerant filament',
    });
  });

  it('warns about a part whose mesh touches a servo, whatever its outline', () => {
    const far: V3 = [500, 500, 500];

    expect(heat(box(far, [600, 600, 600]), ['shell'])).toMatchObject({ status: 'warn', ids: ['shell'] });
  });
});
