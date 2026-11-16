import loadMujoco from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { closedLinkage } from './fixtures/closedLinkages';
import { SimEngine } from './engine';
import { buildMjcf } from './mjcf';
import { buildRig } from '../utils/kinematics';
import { loopValue } from '../utils/kinematicsLoop';
import { box, fixtureMeasures, fixtureTriangles, joint } from './fixtures/parts';

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

it('resets passive angles from the crank, retains limits and changes model evidence after an edit', () => {
  const { input, model } = closedLinkage();
  const pose = { values: { 'fb0-crank-joint': 20, 'fb0-coupler-joint': 99 } };
  const changed = buildMjcf({ ...input, pose });
  const engine = new SimEngine(mj, changed);

  try {
    const coupler = input.project.joints.find((j) => j.loop?.link === 'coupler')!;
    const index = changed.joints.findIndex((j) => j.id === coupler.id);

    expect(engine.jointAngles()[index]).toBeCloseTo((loopValue(coupler, 20) * Math.PI) / 180);
    engine.reset({ values: { 'fb0-crank-joint': 30 } });
    expect(engine.jointAngles()[index]).toBeCloseTo((loopValue(coupler, 30) * Math.PI) / 180);
    expect(engine.model.jnt_range[1]).toBeCloseTo((100 * Math.PI) / 180);
    expect(engine.model.dof_armature[index]).toBe(0);
    expect(engine.model.dof_damping[index]).toBe(0);
    expect(engine.model.dof_frictionloss[index]).toBe(0);

    const edited = {
      ...input,
      rig: buildRig(
        input.project.joints.map((j) => (j.loop ? { ...j, damping: 0.01 } : j)),
        input.parts,
      ),
    };

    expect(buildMjcf(edited).robots[0].fingerprint).not.toBe(model.robots[0].fingerprint);
    expect(buildMjcf(input).robots[0].fingerprint).toBe(model.robots[0].fingerprint);
  } finally {
    engine.dispose();
  }
});

it('distinguishes a locked crank and a broken closing pin from articulated motion', () => {
  const { model } = closedLinkage({ name: 'loaded tilted', lengths: [40, 20, 50, 50], tilted: true });
  const locked = new SimEngine(mj, model);
  const broken = new SimEngine(mj, { ...model, xml: model.xml.replace(/<equality>[\s\S]*?<\/equality>/, '') });

  try {
    locked.setFault('fb0-crank-joint', 'stuck');
    locked.setController({ kind: 'hold', values: { 'fb0-crank-joint': 20 } });
    broken.setController({ kind: 'hold', values: { 'fb0-crank-joint': 20 } });
    locked.step(0.4);
    broken.step(0.4);
    expect(Math.abs(locked.jointAngles()[0])).toBeLessThan(0.01);
    expect(Math.abs(broken.jointAngles()[2])).toBeGreaterThan(0.1);
    expect(Math.abs(broken.jointAngles()[1] - locked.jointAngles()[1])).toBeGreaterThan(0.1);
  } finally {
    locked.dispose();
    broken.dispose();
  }
});

it('refuses a singular start and a missing catalog variant without a welded substitute', () => {
  const { input } = closedLinkage();
  const joints = input.project.joints.map((j) =>
    j.loop
      ? {
          ...j,
          loop: { ...j.loop, fourBar: { ground: 40, crank: 20, coupler: 10, rocker: 10, theta: 0 } },
        }
      : j,
  );

  expect(() => buildMjcf({ ...input, rig: buildRig(joints, input.parts) })).toThrow(/four-bar/);

  const parts = input.parts.map((p) => (p.componentId ? { ...p, componentVariant: undefined } : p));

  expect(() => buildMjcf({ ...input, parts, rig: buildRig(input.project.joints, parts) })).toThrow(
    /Choose the crank servo variant/,
  );
});

it('invalidates every robot fingerprint when a closure changes the shared solver tolerance', () => {
  const { input } = closedLinkage();
  const other = [box('base', [500, 300, 0], [20, 20, 20], 100), box('tip', [500, 320, 0], [10, 20, 10], 20)];
  const hinge = joint({ id: 'other', link: ['base', 'tip'], origin: [500, 310, 0], axis: [0, 0, 1], effortNm: 1 });
  const parts = [...input.parts, ...other];
  const build = (closed: boolean) => {
    const joints = [...input.project.joints.map((j) => (closed ? j : { ...j, loop: undefined })), hinge];

    return buildMjcf({
      ...input,
      parts,
      project: { ...input.project, joints },
      rig: buildRig(joints, parts),
      measures: fixtureMeasures(parts),
      partTriangles: fixtureTriangles(parts),
    });
  };
  const welded = build(false);
  const closed = build(true);
  const fingerprint = (model: typeof welded) => model.robots.find((r) => r.key === hinge.id)!.fingerprint;

  expect(welded.xml).not.toContain('tolerance=');
  expect(closed.xml).toContain('tolerance="1e-12"');
  expect(fingerprint(closed)).not.toBe(fingerprint(welded));
  expect(fingerprint(build(true))).toBe(fingerprint(closed));
  expect(fingerprint(build(false))).toBe(fingerprint(welded));
});
