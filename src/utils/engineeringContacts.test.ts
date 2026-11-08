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
