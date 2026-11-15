import loadMujoco, { type MainModule, type MjModel, type MjData } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { contactScene as scene, contactSliders } from './fixtures/contactRobots';
import type { SimModel } from './mjcf';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function closeSliders(xml: string): number[] {
  const model = mj.MjModel.from_xml_string(xml);
  const data = new mj.MjData(model);

  try {
    data.ctrl.set([0.01, -0.01]);

    for (let i = 0; i < 100; i++) mj.mj_step(model, data);

    return Array.from(data.qpos);
  } finally {
    data.delete();
    model.delete();
  }
}

function contacts(sim: SimModel): string[][] {
  const model = mj.MjModel.from_xml_string(sim.xml);
  const data = new mj.MjData(model);

  try {
    mj.mj_forward(model, data);

    return contactNames(model, data);
  } finally {
    data.delete();
    model.delete();
  }
}

function contactNames(model: MjModel, data: MjData): string[][] {
  const list = data.contact;

  try {
    return Array.from({ length: data.ncon }, (_, i) => {
      const contact = list.get(i)!;

      const names = [contact.geom1, contact.geom2].map((id) => mj.mj_id2name(model, mj.mjtObj.mjOBJ_GEOM.value, id)!);

      contact.delete();

      return names;
    });
  } finally {
    list.delete();
  }
}

const isRobot = (name: string) => /^g_r\d+-/.test(name);
const sameRobot = (pair: string[]) => pair.every(isRobot) && pair[0].split('-')[0] === pair[1].split('-')[0];

describe('robot collision membership', () => {
  it('produces contacts between separate robots while suppressing every self contact', () => {
    const pairs = contacts(scene(2));

    expect(pairs.some((pair) => pair.every(isRobot) && !sameRobot(pair))).toBe(true);
    expect(pairs.some(sameRobot)).toBe(false);
  });

  it('physically blocks opposing robot links that otherwise pass through each other', () => {
    const model = contactSliders();
    const held = closeSliders(model.xml);
    const passing = closeSliders(model.xml.replace(/conaffinity="[24]"/g, 'conaffinity="0"'));

    expect(Math.abs(held[0])).toBeLessThan(0.001);
    expect(Math.abs(held[1])).toBeLessThan(0.001);
    expect(passing[0]).toBeGreaterThan(0.005);
    expect(passing[1]).toBeLessThan(-0.005);
  });

  it('detects self contacts when a robot membership mask is deliberately removed', () => {
    const model = scene(1);
    const broken = {
      ...model,
      xml: model.xml.replaceAll('contype="1" conaffinity="0"', 'contype="1" conaffinity="1"'),
    };

    expect(contacts(broken).some(sameRobot)).toBe(true);
  });

  it('preserves floor, scenery, loose-object and world contacts while ignoring markers', () => {
    const pairs = contacts(scene(2));
    const touches = (name: string) => pairs.some((pair) => pair.includes(name) && pair.some(isRobot));

    for (const name of ['floor', 'g_scenery', 'g_object', 'wg_wall', 'wg_crate']) expect(touches(name)).toBe(true);

    expect(pairs.flat()).not.toContain('wg_marker');
  });

  it('keeps the single-robot model and fingerprint independent of other robot membership', () => {
    const single = scene(1);
    const multiple = scene(2);

    expect(single.robots[0].fingerprint).toBe(multiple.robots[0].fingerprint);
    expect(contacts(single).some(sameRobot)).toBe(false);
    expect(single.xml).not.toContain('<exclude');
  });

  it('uses every robot mask bit without disabling the last robot contacts', () => {
    const model = scene(31);
    const pairs = contacts(model);

    expect(model.xml).not.toContain('<exclude');
    expect(
      pairs.some(
        (pair) => pair.some((name) => name.startsWith('g_r30-')) && pair.some((name) => name.startsWith('g_r29-')),
      ),
    ).toBe(true);
    expect(pairs.some(sameRobot)).toBe(false);
  });

  it('supports more robots than mask bits without self contacts or merged memberships', () => {
    const model = scene(33);
    const pairs = contacts(model);

    expect(
      pairs.some(
        (pair) => pair.some((name) => name.startsWith('g_r32-')) && pair.some((name) => name.startsWith('g_r31-')),
      ),
    ).toBe(true);
    expect(pairs.some(sameRobot)).toBe(false);
    expect(model.robots[0].fingerprint).toBe(scene(1).robots[0].fingerprint);
  });
});
