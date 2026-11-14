import { describe, expect, it } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import type { WalkSim } from './engineeringTypes';
import { biped, box, component, joint, load, part, row, run, XM430, type Measures } from './engineering.fixtures';

describe('leg loads follow the robot, not the scene', () => {
  const base = load(run(biped()), 'kneeL').loadNm;

  it('keeps knee load when the soles sit 3 mm above the floor', () => {
    const r = run(biped({ lift: 3 }));

    expect(load(r, 'kneeL').kind).toBe('stance');
    expect(load(r, 'kneeL').loadNm).toBeCloseTo(base, 6);
    expect(row(r, 'Standing stability')).toBeDefined();
  });

  it('notes it when no foot reaches the robot’s lowest point', () => {
    const s = biped();

    s.parts.push(part('tail', { massG: 10 }));
    s.joints[0] = { ...s.joints[0], parent: ['torso', 'tail'] };
    s.measures.tail = box([-5, -50, -5], [5, 450, 5]);

    const r = run(s);

    expect(row(r, 'Servo torque')?.status).toBe('warn');
    expect(row(r, 'Servo torque')?.detail).toMatch(/No foot reaches the robot’s lowest point/);
  });

  it('leaves a table beside the robot out of its weight and footprint', () => {
    const s = biped();
    const alone = run(s);

    s.parts.push(part('table', { massG: 20000 }));
    s.measures.table = box([500, 0, -300], [1100, 700, 300]);

    const r = run(s);

    expect(load(r, 'kneeL').loadNm).toBeCloseTo(load(alone, 'kneeL').loadNm, 6);
    expect(r.stability).toEqual(alone.stability);
    expect(r.massG).toBeCloseTo(alone.massG, 6);
    expect(row(r, 'Weight')?.detail).toMatch(/Leaves out 1 part off the robot \(20\.0 kg\)$/);
  });

  it('never counts a dynamic object as robot', () => {
    const s = biped();
    const alone = run(s);

    s.parts.push(part('crate', { massG: 9000, physics: { dynamic: true } }));
    s.measures.crate = box([-40, 620, -40], [40, 700, 40]);

    expect(load(run(s), 'kneeL').loadNm).toBeCloseTo(load(alone, 'kneeL').loadNm, 6);
  });

  it('keeps each robot’s own load and one-leg share with two robots in the scene', () => {
    const a = biped();
    const b = biped({ prefix: 'b_', dx: 2000 });
    const r = run({
      parts: [...a.parts, ...b.parts],
      measures: { ...a.measures, ...b.measures },
      joints: [...a.joints, ...b.joints],
    });
    const alone = run(a);

    expect(load(r, 'hipL').loadNm).toBeCloseTo(load(alone, 'hipL').loadNm, 6);
    expect(load(r, 'kneeL').loadNm).toBeCloseTo(load(alone, 'kneeL').loadNm, 6);
    expect(load(r, 'b_kneeL').loadNm).toBeCloseTo(load(alone, 'kneeL').loadNm, 6);
    expect(r.stability?.marginMm).toBeCloseTo(alone.stability!.marginMm, 6);
  });

  it('counts a part that touches the robot, even if no joint names it', () => {
    const s = biped();
    const alone = run(s);

    s.parts.push(part('pack', { massG: 1000 }));
    s.measures.pack = box([-50, 450, -40], [50, 550, 40]);

    expect(run(s).massG).toBeCloseTo(alone.massG + 1000, 6);
  });
});

describe('leg joints are found however the robot is built', () => {
  const facingZ = load(run(biped()), 'kneeL');

  it('finds the pitch axis of a robot facing X', () => {
    const turned = load(run(biped({ facing: 'x' })), 'kneeL');

    expect(turned.crouchNm).toBeCloseTo(facingZ.crouchNm!, 6);
    expect(turned.kind).toBe('stance');
  });

  it('takes the leg from the joint’s name when no limb is set', () => {
    const named = load(run(biped({ limb: false })), 'kneeL');

    expect(named.kind).toBe(facingZ.kind);
    expect(named.loadNm).toBeCloseTo(facingZ.loadNm, 6);
  });

  it('does not read an end effector or a pan as a leg', () => {
    const s = biped({ limb: false });

    s.joints.push(joint('end_effector', { child: ['torso'], axis: [1, 0, 0], origin: [0, 500, 0] }));

    expect(load(run(s), 'end_effector').crouchNm).toBeUndefined();
  });

  it('shares stance as well as crouch load across four legs', () => {
    const parts = [part('body', { massG: 7000 })];
    const measures: Measures = { body: box([-60, 200, -100], [60, 260, 100]) };
    const joints: RobotJoint[] = [];

    for (const [i, x, z] of [
      [0, -80, -100],
      [1, 80, -100],
      [2, -80, 100],
      [3, 80, 100],
    ] as const) {
      const out = x > 0 ? 30 : -30;

      parts.push(part(`foot${i}`, { massG: 50 }), component(`s${i}`, XM430, { massG: 82 }));
      measures[`foot${i}`] = box([x - 20 + out, 0, z - 20], [x + 20 + out, 205, z + 20]);
      measures[`s${i}`] = box([x - 14, 200, z - 14], [x + 14, 246, z + 14]);
      joints.push(
        joint(`roll${i}`, {
          origin: [x, 220, z],
          axis: [0, 0, 1],
          limb: 'leg',
          parent: ['body'],
          child: [`foot${i}`],
          actuators: [`s${i}`],
          range: [-30, 30],
        }),
      );
    }

    const l = load(run({ parts, measures, joints }), 'roll0');
    const weightNm = (r: number) => (7.528 * 9.81 * r) / 1000;

    expect(l.stanceNm).toBeCloseTo(weightNm(30) * 0.5, 0);
  });
});

describe('Peak torque', () => {
  it('grades a leg joint whose holding load is worse than its stance load', () => {
    const s = biped();
    const thigh = s.parts.find((p) => p.id === 'thighL')!;

    thigh.massG = 650;
    s.measures.thighL = box([-80, 80, -20], [-40, 120, 20]);

    const walk: WalkSim = {
      policy: 'p',
      seconds: 14,
      fellAt: null,
      joints: Object.fromEntries(s.joints.map((j) => [j.id, { p99Nm: 1, rmsNm: 0.5, overS: 0 }])),
    };

    walk.joints.hipL = { p99Nm: 9.9, rmsNm: 5, overS: 5 };

    expect(load(run(s, {}, { walk }), 'hipL').kind).toBe('hold');
    expect(row(run(s, {}, { walk }), 'Peak torque')?.status).toBe('fail');
  });
});

describe('Range of motion samples', () => {
  const samples = (range: [number, number], published = false) => {
    const seen: number[][] = [];

    run(
      {
        parts: [part('a', { massG: 100 }), part('b', { massG: 100 })],
        measures: { a: box([0, 0, 0], [10, 10, 10]), b: box([20, 0, 0], [30, 10, 10]) },
        joints: [joint('k', { parent: ['a'], child: ['b'], range, published: published ? 'maker' : undefined })],
      },
      {},
      { sweep: (s) => (seen.push(s.anglesDeg), []) },
    );

    return seen[0];
  };

  it('stays inside a range that doesn’t cross zero', () => {
    expect(samples([30, 90])).toEqual([30, 45, 60, 75, 90]);
    expect(samples([45, 135])).toEqual([45, 60, 75, 90, 105, 120, 135]);
  });

  it('reaches every 15° of a designed joint and both ends', () => {
    const got = samples([-100, 100]);

    expect(got).toContain(75);
    expect(got).toContain(-100);
    expect(got).toContain(100);
    expect(got).not.toContain(0);
    expect(got).toHaveLength(14);
  });

  it('samples published joints more coarsely', () => {
    expect(samples([-90, 90], true)).toEqual([-90, -60, -30, 30, 60, 90]);
  });

  it('finds a clash between the old half-way and end samples', () => {
    const r = run(
      {
        parts: [part('a', { massG: 100 }), part('b', { massG: 100 })],
        measures: { a: box([0, 0, 0], [10, 10, 10]), b: box([20, 0, 0], [30, 10, 10]) },
        joints: [joint('k', { parent: ['a'], child: ['b'], range: [-90, 90] })],
      },
      {},
      {
        sweep: (s) =>
          s.anglesDeg.filter((v) => v === 60 || v === 75).map((angle) => ({ a: 'b', b: 'a', depthMm: 5, angle })),
      },
    );

    expect(row(r, 'Range of motion')?.status).toBe('fail');
  });

  it('says slides aren’t swept instead of claiming every joint clears', () => {
    const scene = (joints: RobotJoint[]) => ({
      parts: [part('a', { massG: 100 }), part('b', { massG: 100 })],
      measures: { a: box([0, 0, 0], [10, 10, 10]), b: box([20, 0, 0], [30, 10, 10]) },
      joints,
    });
    const slide = joint('slide', { type: 'prismatic', parent: ['a'], child: ['b'], range: [0, 100] });
    const turn = joint('turn', { parent: ['a'], child: ['b'], range: [-90, 90] });

    expect(row(run(scene([slide]), {}, { sweep: () => [] }), 'Range of motion')).toMatchObject({
      status: 'not run',
      detail: '1 slide not swept',
    });
    expect(row(run(scene([slide, turn]), {}, { sweep: () => [] }), 'Range of motion')?.detail).toMatch(
      /^Every turning joint clears its range, sampled every 15°; 1 slide not swept$/,
    );
  });
});
