import { describe, expect, it } from 'vitest';
import { actuatorOf } from '../data/components';
import type { MeshMeasure } from '../three/meshMeasure';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { ratingAt } from './actuatorRules';
import { runEngineering } from './engineering';
import { biped, box, component, joint, part, project, row, run, XM430, type Measures } from './engineering.fixtures';

describe('Servo voltage and current', () => {
  const single = (componentId: string, extra: ScenePart[] = [], measures: Measures = {}) => ({
    parts: [component('s', componentId, { massG: 82 }), ...extra],
    measures: { s: box([0, 100, 0], [28, 146, 34]), ...measures },
    joints: [] as RobotJoint[],
  });
  const pack = (id: string, componentId: string, x = 0) => ({
    part: component(id, componentId),
    measure: box([x, 0, 0], [x + 50, 20, 100]),
  });

  it('fails a pack that can’t reach the servo’s minimum and rates torque at the real voltage', () => {
    const p = pack('b', 'ovonic-2s-2200-50c');
    const r = run(single(XM430, [p.part], { b: p.measure }));
    const act = actuatorOf(XM430)!;

    expect(row(r, 'Servo voltage')).toMatchObject({ status: 'fail', ids: ['s'] });
    expect(row(r, 'Servo voltage')?.detail).toMatch(/reaches only 8\.4 V charged, below the 10 V minimum of 1 servo$/);
    expect(ratingAt(act, 7.4).volts).toBeCloseTo(7.4, 6);
    expect(ratingAt(act, 7.4).stallNm).toBeLessThan(ratingAt(act, 10).stallNm);
  });

  it('gives the same answer whichever pack comes first', () => {
    const a = pack('a', 'ovonic-2s-2200-50c');
    const b = pack('b', 'ovonic-4s-2200-35c', 100);
    const measures = { a: a.measure, b: b.measure };
    const first = run(single('feetech-sts3250', [a.part, b.part], measures));
    const second = run(single('feetech-sts3250', [b.part, a.part], measures));

    expect(row(first, 'Servo voltage')).toEqual(row(second, 'Servo voltage'));
    expect(row(first, 'Servo voltage')?.status).toBe('pass');
  });

  it('gives the same rail whichever regulator comes first, and takes the higher voltage', () => {
    const p = pack('pack', 'ovonic-3s-2200-50c');
    const r5 = component('r5', 'pololu-d36v50f5');
    const r6 = component('r6', 'pololu-d36v50f6');
    const measures = { pack: p.measure, r5: box([100, 0, 0], [120, 10, 20]), r6: box([130, 0, 0], [150, 10, 20]) };
    const scene = (regs: ScenePart[]) => {
      const s = single('feetech-sts3215', [p.part, ...regs], measures);

      s.parts[0] = component('s', 'feetech-sts3215', { componentVariant: 'c001', massG: 55 });

      return s;
    };
    const first = run(scene([r5, r6]));
    const second = run(scene([r6, r5]));

    expect(row(first, 'Servo voltage')).toEqual(row(second, 'Servo voltage'));
    expect(row(first, 'Servo voltage')?.ids).toEqual(['r6']);
  });

  it('counts motors as actuators in the power checks', () => {
    const noPack = run(single('cubemars-ak60-6'));
    const p = pack('b', 'ovonic-2s-2200-50c');
    const low = run(single('cubemars-ak60-6', [p.part], { b: p.measure }));

    expect(row(noPack, 'Supply current')).toBeDefined();
    expect(row(low, 'Servo voltage')?.status).toBe('fail');
  });

  it('warns when a regulator can’t carry the servos, and converts rail amps to pack amps', () => {
    const servos = Array.from({ length: 12 }, (_, i) => component(`s${i}`, 'feetech-sts3250', { massG: 80 }));
    const measures: Measures = {
      pack: box([0, 0, 0], [50, 20, 100]),
      rail: box([100, 0, 0], [120, 10, 20]),
    };

    servos.forEach((s, i) => {
      measures[s.id] = box([i * 50, 100, 0], [i * 50 + 30, 140, 30]);
    });

    const joints = servos.map((s) => joint(`j${s.id}`, { limb: 'leg', actuators: [s.id] }));
    const r = run({
      parts: [...servos, component('pack', 'ovonic-4s-2200-35c'), component('rail', 'pololu-d36v50f12')],
      measures,
      joints,
    });
    const current = row(r, 'Current and runtime')!;
    const railAmps = Number(/about ([\d.]+) A at peak/.exec(current.items![0].text)![1]);
    const packAmps = Number(/^About ([\d.]+) A peak/.exec(current.detail)![1]);

    expect(row(r, 'Servo voltage')?.ids).toEqual(['rail']);
    expect(current).toMatchObject({ status: 'warn', ids: ['rail'] });
    expect(packAmps).toBeLessThan(railAmps);
  });
});

describe('Servo alignment and joint support', () => {
  const arm = (o: Partial<RobotJoint>, parts: ScenePart[] = []) => ({
    parts: [
      part('frame', { massG: 100 }),
      part('link', { massG: 100 }),
      component('s', 'feetech-sts3215', { componentVariant: 'c001', massG: 55 }),
      ...parts,
    ],
    measures: {
      frame: box([0, 0, 0], [10, 10, 10]),
      link: box([0, 0, 40], [40, 10, 50]),
      s: box([0, 50, 0], [40, 90, 20]),
      bearing: box([-5, -2, -5], [5, 2, 5]),
    },
    joints: [joint('j', { parent: ['frame'], child: ['link'], actuators: ['s'], axis: [0, 1, 0], ...o })],
  });

  it('passes a servo whose second output lies on the joint', () => {
    const r = run(
      arm({}),
      {},
      {
        servoOutputs: {
          s: {
            point: [500, 0, 0],
            axis: [0, 1, 0],
            alternates: [{ point: [0, 0, 0], axis: [0, 1, 0] }],
          },
        },
      },
    );

    expect(row(r, 'Servo alignment')?.status).toBe('pass');
  });

  it('does not claim an alignment it never measured', () => {
    const none = run(arm({}));
    const some = run(
      {
        ...arm({}),
        joints: [
          ...arm({}).joints,
          joint('j2', { parent: ['frame'], child: ['link'], actuators: ['frame'], axis: [0, 1, 0] }),
        ],
      },
      {},
      { servoOutputs: { s: { point: [0, 0, 0], axis: [0, 1, 0] } } },
    );

    expect(row(none, 'Servo alignment')).toMatchObject({ status: 'not run', detail: 'No output known for 1 servo' });
    expect(row(some, 'Servo alignment')?.detail).toBe(
      'Every measured servo output lies on its joint axis; no output known for 1',
    );
  });

  it('counts a flanged bearing on the axis as support', () => {
    const flanged = part('bearing', {
      kind: 'hardware',
      hardware: { type: 'flanged_bearing', size: 'MF63' } as ScenePart['hardware'],
    });

    expect(row(run(arm({}, [flanged])), 'Joint support')?.status).toBe('pass');
  });

  it('does not let a servo in the moving link straddle itself', () => {
    const s = arm({ child: ['s', 'link'], axis: [0, 0, 1], origin: [20, 70, 10] });

    expect(actuatorOf('feetech-sts3215', 'c001')?.dualShaft).toBe(true);
    expect(row(run(s), 'Joint support')?.status).toBe('warn');
  });
});

describe('Standing stability and heat', () => {
  const wheeled = (caster: boolean) => {
    const parts = [
      part('body', { massG: 2000 }),
      part('wheelL', { massG: 100 }),
      part('wheelR', { massG: 100 }),
      ...(caster ? [part('caster', { massG: 20 })] : []),
    ];
    const measures: Measures = {
      body: box([-80, 60, -30], [80, 200, 90]),
      wheelL: box([-120, 0, -100], [-80, 200, 100]),
      wheelR: box([80, 0, -100], [120, 200, 100]),
      ...(caster ? { caster: box([-10, 0, 150], [10, 20, 170]) } : {}),
    };

    if (caster) measures.body = box([-80, 15, -30], [80, 200, 160]);

    const wheelJoint = (id: string, child: string, x: number) =>
      joint(id, { parent: ['body'], child: [child], origin: [x, 100, 0], axis: [1, 0, 0] });

    return { parts, measures, joints: [wheelJoint('l', 'wheelL', -100), wheelJoint('r', 'wheelR', 100)] };
  };

  it('reads two wheels on an axle as a line, not as a footprint', () => {
    expect(row(run(wheeled(false)), 'Standing stability')).toMatchObject({
      status: 'warn',
      detail: 'Rests on a line with no third contact, so it has to balance itself',
    });
  });

  it('passes the same wheels with a caster behind them', () => {
    expect(row(run(wheeled(true)), 'Standing stability')?.status).toBe('pass');
  });

  it('keeps a square foot joint as a footprint', () => {
    const r = run(biped());

    expect(row(r, 'Standing stability')?.status).not.toBe('warn');
    expect(r.stability?.onALine).toBe(false);
  });

  const heat = (shell: MeshMeasure) => {
    const s = component('s', 'feetech-sts3215', { componentVariant: 'c018' });
    const r = runEngineering({
      parts: [part('shell', { printMaterial: 'PLA' }), s],
      project: project({ material: 'PLA' }),
      measures: { shell, s: box([-20, 140, -12], [20, 165, 12], 30000) },
      servoOutputs: {},
    });

    return row(r, 'Heat near servos')!;
  };

  it('doesn’t call a shell far around a servo touching', () => {
    expect(heat(box([-150, 0, -150], [150, 300, 150], 300000)).status).toBe('pass');
  });

  it('warns about PLA pressed against a servo', () => {
    expect(heat(box([-25, 165, -15], [25, 170, 15], 7000)).status).toBe('warn');
    expect(heat(box([-25, 135, -15], [25, 170, 15], 7000)).status).toBe('warn');
  });
});

describe('Budget', () => {
  const printed = () => ({
    parts: [part('big')],
    measures: { big: box([0, 0, 0], [100, 100, 100], 200000) },
    joints: [] as RobotJoint[],
  });

  it('counts the support filament it’s given and says so when it isn’t', () => {
    const budgetUsd = 25;
    const without = row(run(printed(), { material: 'PLA', budgetUsd }), 'Budget')!;
    const withSupport = row(run(printed(), { material: 'PLA', budgetUsd }, { supportG: { PLA: 3000 } }), 'Budget')!;

    expect(without.detail).toMatch(/support filament not counted$/);
    expect(withSupport.detail).not.toMatch(/support filament/);
    expect(withSupport.status).toBe('fail');
  });
});
