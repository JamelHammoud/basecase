import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import type { buildRig } from '../utils/kinematics';
import { selfContactArm as foldingArm } from './fixtures/selfContactArm';
import { buildMjcf } from './mjcf';
import { robotContactExclusions, robotContactMasks } from './mjcfContacts';
import { contactScene } from './fixtures/contactRobots';
import { isStalePolicy, modelFingerprints } from './policyFreshness';
import { SIM_MODEL_VERSION } from './mjcfTypes';
import { closedLinkage } from './fixtures/closedLinkages';
import { declaredContactPairs } from './selfContact';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function fold(enabled: boolean, exclusions?: [string, string][]) {
  const sim = foldingArm(enabled, exclusions);
  const model = mj.MjModel.from_xml_string(sim.xml);
  const data = new mj.MjData(model);
  const pairs = new Set<string>();

  try {
    data.ctrl.set([0, -Math.PI / 2]);

    for (let step = 0; step < 1000; step++) {
      mj.mj_step(model, data);

      collectContacts(model, data, pairs);
    }

    return { position: data.qpos[1], pairs };
  } finally {
    data.delete();
    model.delete();
  }
}

it('stops a folding arm against its base only when authored self-contact is enabled', () => {
  const enabled = fold(true);
  const disabled = fold(false);

  expect(enabled.pairs).toContain('g_base/g_tip');
  expect(enabled.pairs).not.toContain('g_tip/g_upper');
  expect(disabled.pairs).not.toContain('g_base/g_tip');
  expect(enabled.position).toBeGreaterThan(disabled.position + 0.05);
});

it('changes policy freshness when enabled and restores the legacy fingerprint when disabled', () => {
  const enabled = foldingArm(true);
  const disabled = foldingArm(false);
  const record = {
    modelVersion: SIM_MODEL_VERSION,
    fingerprint: disabled.robots[0].fingerprint,
    robot: disabled.robots[0].key,
  };

  expect(isStalePolicy(record, modelFingerprints(disabled))).toBe(false);
  expect(isStalePolicy(record, modelFingerprints(enabled))).toBe(true);
  expect(isStalePolicy(record, modelFingerprints(foldingArm(false)))).toBe(false);
});

it('honors only the explicitly authored non-adjacent exclusion and includes it in freshness', () => {
  const excluded = fold(true, [['base', 'tip']]);

  expect(excluded.pairs).not.toContain('g_base/g_tip');
  expect(excluded.position).toBeCloseTo(fold(false).position, 8);
  expect(foldingArm(true, [['base', 'tip']]).robots[0].fingerprint).not.toBe(foldingArm(true).robots[0].fingerprint);
  expect(foldingArm(true, [['base', 'tip']]).robots[0].fingerprint).toBe(
    foldingArm(true, [['tip', 'base']]).robots[0].fingerprint,
  );
});

it('keeps enabled policy fingerprints stable across unrelated robot indices and overflow', () => {
  const single = contactScene(1, [0]);
  const many = contactScene(33, [0], true);
  const own = many.robots.find((robot) => robot.key === single.robots[0].key)!;

  expect(own.fingerprint).toBe(single.robots[0].fingerprint);
});

it.each([2, 31, 33])('retains other robots and world contacts with self-contact enabled among %i robots', (count) => {
  const sim = contactScene(count, [0]);
  const model = mj.MjModel.from_xml_string(sim.xml);
  const data = new mj.MjData(model);
  const pairs = new Set<string>();

  try {
    mj.mj_forward(model, data);
    collectContacts(model, data, pairs);

    expect(pairs).toContain('g_r0-base/g_r0-tip');
    expect(pairs).not.toContain('g_r0-base/g_r0-middle');
    expect(pairs).not.toContain('g_r1-base/g_r1-tip');
    expect(pairs).toContain('g_r0-tip/g_r1-tip');

    for (const world of ['floor', 'g_scenery', 'g_object', 'wg_wall', 'wg_crate'])
      expect([...pairs].some((pair) => pair.split('/').includes(world))).toBe(true);

    expect([...pairs].some((pair) => pair.includes('wg_marker'))).toBe(false);
  } finally {
    data.delete();
    model.delete();
  }
});

it('excludes the actual closing pin of a generated Sketch mechanism', () => {
  const fixture = closedLinkage();
  const key = fixture.input.rig.robots[0].key;
  const model = buildMjcf({
    ...fixture.input,
    project: { ...fixture.input.project, selfContact: { [key]: { enabled: true } } },
  });
  const coupler = model.bodies.find((body) => body.parts.includes('fb0-coupler'))!;
  const rocker = model.bodies.find((body) => body.parts.includes('fb0-rocker'))!;

  expect(model.xml).toContain(`<exclude body1="${coupler.name}" body2="${rocker.name}"/>`);
});

it('refuses excluded parts outside the robot and bounds the exclusion workload', () => {
  const bodies = foldingArm(true).bodies;

  expect(() => declaredContactPairs(bodies, { enabled: true, exclusions: [['base', 'missing']] })).toThrow(
    'Choose two parts',
  );
  expect(() => declaredContactPairs(bodies, { enabled: true, exclusions: [['base', 'base']] })).toThrow(
    'Choose two parts',
  );
  expect(() =>
    declaredContactPairs(bodies, { enabled: true, exclusions: Array.from({ length: 257 }, () => ['base', 'tip']) }),
  ).toThrow('128 links and 256 excluded pairs');
  expect(declaredContactPairs(bodies, { enabled: true, exclusions: [['base', 'tip']] })).toEqual([
    [bodies.find((body) => body.parts.includes('base')), bodies.find((body) => body.parts.includes('tip'))],
  ]);
});

it('collapses fixed assemblies before deriving adjacent body exclusions', () => {
  const robots = [{ key: 'arm', name: 'arm', parts: new Set(['base', 'mount', 'upper', 'tip']), pivot: [0, 0, 0] }];
  const bodies = [
    { name: 'root', robot: 'arm', parts: ['base'], origin: [0, 0, 0] },
    { name: 'mount', robot: 'arm', parts: ['mount'], parent: 'root', joint: 'fixed', origin: [0, 0, 0] },
    { name: 'upper', robot: 'arm', parts: ['upper'], parent: 'mount', joint: 'shoulder', origin: [0, 0, 0] },
    { name: 'tip', robot: 'arm', parts: ['tip'], parent: 'upper', joint: 'elbow', origin: [0, 0, 0] },
  ].map((body) => ({ ...body, origin: [0, 0, 0] as [number, number, number] }));
  const config = { arm: { enabled: true } };
  const xml = robotContactExclusions(robots as ReturnType<typeof buildRig>['robots'], bodies, {
    config,
    movable: new Set(['shoulder', 'elbow']),
  });

  expect(xml).toContain('body1="root" body2="mount"');
  expect(xml).toContain('body1="root" body2="upper"');
  expect(xml).not.toContain('body1="root" body2="tip"');
  expect(robotContactMasks(robots as ReturnType<typeof buildRig>['robots'], config).get('tip')).toContain(
    'conaffinity="1"',
  );
});

function collectContacts(
  model: import('@mujoco/mujoco').MjModel,
  data: import('@mujoco/mujoco').MjData,
  pairs: Set<string>,
) {
  const contacts = data.contact;

  for (let i = 0; i < data.ncon; i++) {
    const contact = contacts.get(i)!;
    const names = [contact.geom1, contact.geom2].map((id) => mj.mj_id2name(model, mj.mjtObj.mjOBJ_GEOM.value, id));

    if (contact.dist <= 0) pairs.add(names.sort().join('/'));

    contact.delete();
  }

  contacts.delete();
}
